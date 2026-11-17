import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, flushNow } from './db.ts'
import { resourcePath } from './paths.ts'
import * as auth from './auth.ts'
import { cancelScan, discoverGmail, AuthRequiredError } from './scanner.ts'
import { clearBlocked, replan, scanState, startScheduler, trigger } from './scheduler.ts'
import { checkForUpdate } from './updater.ts'
import { notify, setDefaultNotificationClick } from './notify.ts'
import { startReminders } from './reminders.ts'
import { imageDataUrl, removeTicketFiles, ticketFilePath } from './ticketFiles.ts'
import type { AppSnapshot, Bill, ScanRecord, Settings, Ticket, TicketLink } from '../shared/types.ts'
import { isNothingToPay, safeHttpsUrl, safePaymentUrl } from '../shared/bill.ts'

// Dev only: keep test runs away from the installed app's data.
if (!app.isPackaged && process.env.BILLS_DEV_USER_DATA) app.setPath('userData', process.env.BILLS_DEV_USER_DATA)

const here = fileURLToPath(new URL('.', import.meta.url))
const isMac = process.platform === 'darwin'
// Windows passes --hidden from the login item; macOS can't pass arguments, but says it opened the app at login.
let startHidden = process.argv.includes('--hidden') || (isMac && app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin)

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let toldAboutTray = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  // macOS: opening the app again from Finder or the Dock while it runs.
  app.on('activate', () => showWindow())
  if (process.platform === 'win32') app.setAppUserModelId('com.djmid.billstracker')
  // macOS needs a menu for ⌘C, ⌘V, ⌘A, ⌘Q and ⌘W to work, including in text fields.
  Menu.setApplicationMenu(
    isMac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null,
  )
  app.whenReady().then(boot)
}

/** On macOS the app lives in the menu bar: it has a Dock icon only while its window is open. */
function syncDock(visible: boolean) {
  if (!isMac || !app.dock) return
  if (visible) void app.dock.show()
  else app.dock.hide()
}

function snapshot(): AppSnapshot {
  return {
    bills: db.bills(),
    tickets: db.tickets(),
    settings: db.settings(),
    scan: scanState(),
    onboarded: db.onboarded(),
    appVersion: app.getVersion(),
    platform: process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux',
  }
}

function broadcast() {
  win?.webContents.send('snapshot', snapshot())
  updateTray()
}

function applyLoginItem(settings: Settings) {
  // In dev this would register electron.exe itself, so only the installed app opts in.
  if (!app.isPackaged) return
  if (isMac) app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
  else app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, args: ['--hidden'] })
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
    else syncDock(false)
  })
  win.on('show', () => syncDock(true))
  win.on('hide', () => syncDock(false))

  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win?.hide()
    if (!toldAboutTray) {
      toldAboutTray = notify(
        'Bills Tracker is still running',
        process.platform === 'darwin'
          ? 'It keeps checking your email in the background. Open it from the menu bar icon.'
          : 'It keeps checking your email in the background. Open it from the tray icon.',
      )
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
  // macOS menu bar icons are black-and-alpha "template" images that macOS tints for light and dark bars;
  // the @2x file beside it is picked up automatically on Retina screens.
  const img = nativeImage.createFromPath(resourcePath(isMac ? 'trayTemplate.png' : 'tray.png'))
  if (isMac) img.setTemplateImage(true)
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  // On macOS clicking the menu bar icon opens its menu, which starts with "Open Bills Tracker".
  tray.on('click', showWindow)
  updateTray()
}

function notifyAfterScan(rec: ScanRecord) {
  if (!rec.ok) return
  if (rec.added > 0) {
    notify(
      rec.added === 1 ? 'New bill found' : `${rec.added} new bills found`,
      'Open Bills Tracker to see amounts and payment codes.',
    )
  }
  if (rec.ticketsAdded) {
    notify(
      rec.ticketsAdded === 1 ? 'New ticket or booking found' : `${rec.ticketsAdded} new tickets and bookings found`,
      'Open Bills Tracker to see the date, the codes and the links.',
    )
  }
  const soon = dueSoon(db.bills(), db.settings().notifyDaysBefore)
  if (soon.length && rec.trigger !== 'manual') {
    const total = soon.reduce((s, b) => s + (b.amount ?? 0), 0)
    notify(
      soon.length === 1 ? `${soon[0].vendor} is due soon` : `${soon.length} bills due soon`,
      `€${total.toFixed(2)} to pay in the next ${db.settings().notifyDaysBefore} days.`,
    )
  }
}

function notifyIfUpdated() {
  const version = app.getVersion()
  const last = db.lastRunVersion()
  db.setLastRunVersion(version)
  if (!last || last === version) return
  notify('Bills Tracker updated', `You're now on version ${version}.`)
}

function findTicket(id: string): Ticket {
  const t = db.tickets().find((x) => x.id === id)
  if (!t) throw new Error('Ticket not found')
  return t
}

const TICKET_LINKS: Record<TicketLink, (t: Ticket) => string | null> = {
  tickets: (t) => t.ticketsUrl,
  apple: (t) => t.appleWalletUrl,
  google: (t) => t.googleWalletUrl,
}

/** Only PDFs and images open in the system viewer; wallet passes only on macOS, where Wallet handles them. */
function canOpenAttachment(mimeType: string): boolean {
  if (mimeType === 'application/vnd.apple.pkpass') return process.platform === 'darwin'
  return mimeType === 'application/pdf' || mimeType.startsWith('image/')
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

  // Tickets: like payment links, the renderer names a stored ticket and file, never a URL or path.
  ipcMain.handle('ticket:delete', (_e, id: string) => {
    db.deleteTicket(id)
    removeTicketFiles(id)
    broadcast()
  })
  ipcMain.handle('ticket:openLink', async (_e, id: string, link: TicketLink) => {
    const pick = TICKET_LINKS[link]
    const url = pick ? safeHttpsUrl(pick(findTicket(id))) : null
    if (!url) throw new Error('This ticket has no such link.')
    await shell.openExternal(url)
  })
  ipcMain.handle('ticket:openAttachment', async (_e, id: string, index: number) => {
    const t = findTicket(id)
    const a = t.attachments[index]
    if (!a || !canOpenAttachment(a.mimeType)) throw new Error('This file can’t be opened.')
    const error = await shell.openPath(ticketFilePath(t, a.file))
    if (error) throw new Error(error)
  })
  ipcMain.handle('ticket:image', (_e, id: string, file: string) => imageDataUrl(findTicket(id), file))
  ipcMain.handle('notify:test', () => {
    if (!notify('Notifications are working', 'Bills Tracker will tell you about new bills, due dates and tomorrow’s tickets.')) {
      throw new Error('Notifications aren’t supported on this system.')
    }
  })
}

async function boot() {
  // The installer relaunches with no arguments, so an update restart would otherwise pop the window open.
  if (db.takeRestartHidden()) startHidden = true
  setDefaultNotificationClick(showWindow)
  registerIpc()
  createWindow()
  createTray()
  applyLoginItem(db.settings())
  notifyIfUpdated()
  startScheduler(broadcast, (rec) => {
    notifyAfterScan(rec)
    broadcast()
  })
  startReminders(broadcast)
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
