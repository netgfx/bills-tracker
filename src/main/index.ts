import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, flushNow } from './db.ts'
import { resourcePath } from './paths.ts'
import * as auth from './auth.ts'
import { cancelScan, discoverGmail, AuthRequiredError } from './scanner.ts'
import { clearBlocked, replan, scanState, startScheduler, trigger } from './scheduler.ts'
import { checkForUpdate } from './updater.ts'
import type { AppSnapshot, Bill, ScanRecord, Settings } from '../shared/types.ts'
import { isNothingToPay, safePaymentUrl } from '../shared/bill.ts'

// Dev only: keep test runs away from the installed app's data.
if (!app.isPackaged && process.env.BILLS_DEV_USER_DATA) app.setPath('userData', process.env.BILLS_DEV_USER_DATA)

const here = fileURLToPath(new URL('.', import.meta.url))
let startHidden = process.argv.includes('--hidden')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let toldAboutTray = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.setAppUserModelId('com.djmid.billstracker')
  Menu.setApplicationMenu(null)
  app.whenReady().then(boot)
}

function snapshot(): AppSnapshot {
  return {
    bills: db.bills(),
    settings: db.settings(),
    scan: scanState(),
    onboarded: db.onboarded(),
    appVersion: app.getVersion(),
  }
}

function broadcast() {
  win?.webContents.send('snapshot', snapshot())
  updateTray()
}

function applyLoginItem(settings: Settings) {
  // In dev this would register electron.exe itself, so only the installed app opts in.
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, args: ['--hidden'] })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Bills Tracker',
    backgroundColor: '#eef1f5',
    icon: resourcePath('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  win.on('ready-to-show', () => {
    if (!startHidden || !db.onboarded()) win?.show()
  })

  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win?.hide()
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true
      new Notification({
        title: 'Bills Tracker is still running',
        body: 'It keeps checking your email in the background. Open it from the tray icon.',
        icon: resourcePath('icon.png'),
      }).show()
    }
  })

  // Ctrl+F from anywhere in the window, including while an input or dialog has focus.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && input.key.toLowerCase() === 'f') {
      event.preventDefault()
      win?.webContents.send('focus-search')
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(here, '../renderer/index.html'))
}

function showWindow() {
  if (!win) createWindow()
  if (win!.isMinimized()) win!.restore()
  win!.show()
  win!.focus()
}

function dueSoon(bills: Bill[], days: number) {
  const limit = Date.now() + days * 86_400_000
  return bills.filter(
    (b) =>
      b.status === 'unpaid' && !b.isAutomaticPayment && !isNothingToPay(b) && b.dueDate && Date.parse(b.dueDate) <= limit,
  )
}

function updateTray() {
  if (!tray) return
  const soon = dueSoon(db.bills(), 7)
  const s = scanState()
  tray.setToolTip(
    s.running
      ? `Bills Tracker: ${s.phase ?? 'checking email'}`
      : soon.length
        ? `Bills Tracker: ${soon.length} ${soon.length === 1 ? 'bill' : 'bills'} due within 7 days`
        : 'Bills Tracker: nothing due this week',
  )
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Bills Tracker', click: showWindow },
      { label: s.running ? 'Checking email…' : 'Check email now', enabled: !s.running, click: () => void trigger('manual') },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
}

function createTray() {
  const img = nativeImage.createFromPath(resourcePath('tray.png'))
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.on('click', showWindow)
  updateTray()
}

function notifyAfterScan(rec: ScanRecord) {
  if (!Notification.isSupported()) return
  const icon = resourcePath('icon.png')
  if (rec.ok && rec.added > 0) {
    const n = new Notification({
      title: rec.added === 1 ? 'New bill found' : `${rec.added} new bills found`,
      body: 'Open Bills Tracker to see amounts and payment codes.',
      icon,
    })
    n.on('click', showWindow)
    n.show()
  }
  const soon = dueSoon(db.bills(), db.settings().notifyDaysBefore)
  if (rec.ok && soon.length && rec.trigger !== 'manual') {
    const total = soon.reduce((s, b) => s + (b.amount ?? 0), 0)
    const n = new Notification({
      title: soon.length === 1 ? `${soon[0].vendor} is due soon` : `${soon.length} bills due soon`,
      body: `€${total.toFixed(2)} to pay in the next ${db.settings().notifyDaysBefore} days.`,
      icon,
    })
    n.on('click', showWindow)
    n.show()
  }
}

function notifyIfUpdated() {
  const version = app.getVersion()
  const last = db.lastRunVersion()
  db.setLastRunVersion(version)
  if (!last || last === version || !Notification.isSupported()) return
  const n = new Notification({
    title: 'Bills Tracker updated',
    body: `You're now on version ${version}.`,
    icon: resourcePath('icon.png'),
  })
  n.on('click', showWindow)
  n.show()
}

const ALLOWED_HOSTS = /(^|\.)(claude\.ai|claude\.com|anthropic\.com|google\.com)$/

async function openExternal(url: string) {
  const u = new URL(url)
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.test(u.hostname)) throw new Error('Blocked link')
  await shell.openExternal(url)
}

function registerIpc() {
  ipcMain.handle('snapshot', () => snapshot())

  ipcMain.handle('bill:setPaid', (_e, id: string, paid: boolean) => {
    const bill = db.bills().find((b) => b.id === id)
    if (!bill) throw new Error('Bill not found')
    bill.status = paid ? 'paid' : 'unpaid'
    bill.paidAt = paid ? new Date().toISOString() : null
    bill.paidSource = paid ? 'user' : null
    bill.updatedAt = new Date().toISOString()
    db.upsertBill(bill)
    broadcast()
    return bill
  })

  ipcMain.handle('bill:delete', (_e, id: string) => {
    db.deleteBill(id)
    broadcast()
  })

  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    if (patch.scanTimes) {
      patch.scanTimes = patch.scanTimes.filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
      if (!patch.scanTimes.length) delete patch.scanTimes
    }
    const s = db.updateSettings(patch)
    applyLoginItem(s)
    replan()
    broadcast()
    return s
  })

  ipcMain.handle('scan:now', async () => {
    clearBlocked()
    const p = trigger('manual')
    broadcast()
    return p
  })
  ipcMain.handle('scan:cancel', () => cancelScan())

  ipcMain.handle('auth:status', () => auth.getAuthStatus())
  ipcMain.handle('auth:login', (_e, opts: { sso: boolean; email?: string }) => {
    auth.startLogin(opts, (ev) => {
      win?.webContents.send('login-event', ev)
      if (ev.type === 'done') {
        clearBlocked()
        showWindow()
      }
    })
  })
  ipcMain.handle('auth:code', (_e, code: string) => auth.submitLoginCode(code))
  ipcMain.handle('auth:cancel', () => auth.cancelLogin())
  ipcMain.handle('auth:logout', async () => {
    await auth.logout()
    db.setOnboarded(false)
    broadcast()
  })

  ipcMain.handle('gmail:status', async () => {
    try {
      return (await discoverGmail()).status
    } catch (e) {
      if (e instanceof AuthRequiredError) return { state: 'failed', error: 'Sign in to Claude first.' }
      return { state: 'failed', error: (e as Error).message }
    }
  })

  ipcMain.handle('onboarding:complete', () => {
    db.setOnboarded(true)
    clearBlocked()
    broadcast()
    // First scan right away so the dashboard isn't empty.
    void trigger('manual')
  })

  ipcMain.handle('open-external', (_e, url: string) => openExternal(url))
  // Payment links point at any vendor's site, so the renderer can only ask for a stored bill's link, never pass a URL.
  ipcMain.handle('bill:openPayment', async (_e, id: string) => {
    const url = safePaymentUrl(db.bills().find((b) => b.id === id)?.paymentUrl)
    if (!url) throw new Error('This bill has no payment link.')
    await shell.openExternal(url)
  })
  ipcMain.handle('copy-text', (_e, text: string) => clipboard.writeText(text))
}

async function boot() {
  // The installer relaunches with no arguments, so an update restart would otherwise pop the window open.
  if (db.takeRestartHidden()) startHidden = true
  registerIpc()
  createWindow()
  createTray()
  applyLoginItem(db.settings())
  notifyIfUpdated()
  startScheduler(broadcast, (rec) => {
    notifyAfterScan(rec)
    broadcast()
  })
  checkForUpdate(() => db.setRestartHidden(!win?.isVisible()))
  // If the saved login was revoked while the app was closed, show the sign-in flow.
  const status = await auth.getAuthStatus()
  if (!status.loggedIn && db.onboarded()) {
    db.setOnboarded(false)
    broadcast()
    showWindow()
  }
}

app.on('before-quit', () => {
  quitting = true
  cancelScan()
  auth.cancelLogin()
  flushNow()
})

// The app lives in the tray; closing every window must not quit it.
app.on('window-all-closed', () => {})
