import { powerMonitor } from 'electron'
import { db } from './db.ts'
import { AuthRequiredError, GmailUnavailableError, isScanning, runScan } from './scanner.ts'
import type { ScanRecord, ScanState, ScanTrigger } from '../shared/types.ts'

type Listener = () => void

const state: ScanState = { running: false, phase: null, blocked: null, lastScan: null, nextScanAt: null }
let timer: NodeJS.Timeout | null = null
let retries = 0
let listener: Listener = () => {}
let onFinished: (rec: ScanRecord) => void = () => {}

export function scanState(): ScanState {
  return { ...state, running: isScanning(), lastScan: db.lastScan() }
}

function parseTime(t: string): [number, number] {
  const [h, m] = t.split(':').map(Number)
  return [h ?? 8, m ?? 0]
}

/** Next scheduled slot strictly after `from`. */
export function nextSlot(times: string[], from = new Date()): Date {
  const candidates: Date[] = []
  for (let day = 0; day < 2; day++) {
    for (const t of times) {
      const [h, m] = parseTime(t)
      const d = new Date(from)
      d.setDate(d.getDate() + day)
      d.setHours(h, m, 0, 0)
      if (d > from) candidates.push(d)
    }
  }
  return candidates.sort((a, b) => +a - +b)[0]
}

/** Most recent slot at or before `from`. */
export function previousSlot(times: string[], from = new Date()): Date {
  const candidates: Date[] = []
  for (let day = -1; day <= 0; day++) {
    for (const t of times) {
      const [h, m] = parseTime(t)
      const d = new Date(from)
      d.setDate(d.getDate() + day)
      d.setHours(h, m, 0, 0)
      if (d <= from) candidates.push(d)
    }
  }
  return candidates.sort((a, b) => +b - +a)[0]
}

function schedule(at: Date) {
  if (timer) clearTimeout(timer)
  state.nextScanAt = at.toISOString()
  // setTimeout drifts across sleep; the resume handler re-plans, and long delays are capped so we re-check hourly.
  const delay = Math.min(Math.max(at.getTime() - Date.now(), 1000), 60 * 60_000)
  timer = setTimeout(() => {
    if (Date.now() >= at.getTime() - 1000) void trigger('schedule')
    else schedule(at)
  }, delay)
  listener()
}

function planNext() {
  schedule(nextSlot(db.settings().scanTimes))
}

/** True when a scheduled slot passed while the PC was off, asleep or the app was closed. */
function missedSlot(): boolean {
  const last = db.lastSuccessfulScan()
  if (!last) return db.onboarded()
  return Date.parse(last.startedAt) < previousSlot(db.settings().scanTimes).getTime()
}

export async function trigger(kind: ScanTrigger): Promise<ScanRecord | null> {
  if (isScanning()) return null
  if (state.blocked && kind !== 'manual') return null
  state.phase = 'Starting'
  listener()
  let retryAt: Date | null = null
  try {
    const rec = await runScan(kind, (phase) => {
      state.phase = phase
      listener()
    })
    state.blocked = null
    if (rec.ok || rec.error === 'Scan cancelled.' || retries >= 3) retries = 0
    else {
      // Network blips and usage limits are usually temporary.
      retries++
      retryAt = new Date(Date.now() + 30 * 60_000)
    }
    onFinished(rec)
    return rec
  } catch (e) {
    if (e instanceof AuthRequiredError) state.blocked = 'auth'
    else if (e instanceof GmailUnavailableError) state.blocked = 'gmail'
    return db.lastScan()
  } finally {
    state.phase = null
    const regular = nextSlot(db.settings().scanTimes)
    schedule(retryAt && retryAt < regular ? retryAt : regular)
  }
}

export function startScheduler(onChange: Listener, finished: typeof onFinished) {
  listener = onChange
  onFinished = finished
  planNext()
  if (missedSlot()) setTimeout(() => void trigger('startup-catchup'), 20_000)
  powerMonitor.on('resume', () => {
    planNext()
    if (missedSlot()) setTimeout(() => void trigger('resume'), 30_000) // give Wi-Fi time to reconnect
  })
}

export function replan() {
  planNext()
}

export function clearBlocked() {
  state.blocked = null
  listener()
}
