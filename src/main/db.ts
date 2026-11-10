import { existsSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs'
import { dataFile } from './paths.ts'
import { DEFAULT_SETTINGS, type Bill, type ScanRecord, type Settings } from '../shared/types.ts'
import { splitPaymentCodes } from '../shared/rf.ts'

interface DbShape {
  version: 1
  bills: Bill[]
  settings: Settings
  scans: ScanRecord[]
  /** Gmail message id -> ISO date first seen. Lets scans skip mail that held no bill. */
  seenMessages: Record<string, string>
  dismissed: Bill[]
  onboarded: boolean
  /** Extraction rules the seen-message list was built with; older lists can't be trusted to skip mail. */
  extractionVersion: number
  /** App version on the previous launch; a difference means the app was updated. */
  lastRunVersion: string | null
  /** Set just before an update restart, so an app running in the tray stays there. */
  restartHidden: boolean
}

const EMPTY: DbShape = {
  version: 1, bills: [], settings: DEFAULT_SETTINGS, scans: [], seenMessages: {}, dismissed: [], onboarded: false,
  extractionVersion: 0, lastRunVersion: null, restartHidden: false,
}

let state: DbShape | null = null
let writeTimer: NodeJS.Timeout | null = null

/** Fills fields added after a bill was saved. */
function upgradeBill(b: Bill): Bill {
  return {
    ...b,
    ...splitPaymentCodes(b.rfCode, b.paymentCode),
    customerCode: b.customerCode ?? null,
    paymentUrl: b.paymentUrl ?? null,
  }
}

function load(): DbShape {
  if (state) return state
  const file = dataFile()
  if (!existsSync(file)) return (state = structuredClone(EMPTY))
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DbShape>
    state = {
      ...structuredClone(EMPTY),
      ...parsed,
      // Bills saved before these fields existed.
      // Older scans also kept vendor payment codes in rfCode; splitPaymentCodes moves them to paymentCode.
      bills: (parsed.bills ?? []).map(upgradeBill),
      dismissed: (parsed.dismissed ?? []).map(upgradeBill),
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    } as DbShape
  } catch (err) {
    // Keep the unreadable file for recovery instead of overwriting the user's history.
    copyFileSync(file, `${file}.corrupt-${Date.now()}`)
    console.error('bills.json unreadable, starting fresh', err)
    state = structuredClone(EMPTY)
  }
  return state
}

function flush() {
  if (!state) return
  const file = dataFile()
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  renameSync(tmp, file) // atomic on the same volume, so a crash never leaves half a file
}

function persist() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(flush, 150)
}

export function flushNow() {
  if (writeTimer) clearTimeout(writeTimer)
  flush()
}

export const db = {
  bills: () => load().bills,
  settings: () => load().settings,
  scans: () => load().scans,
  lastScan: () => load().scans.at(-1) ?? null,
  lastSuccessfulScan: () => [...load().scans].reverse().find((s) => s.ok) ?? null,
  onboarded: () => load().onboarded,
  seenSince: (since: Date) =>
    Object.entries(load().seenMessages)
      .filter(([, at]) => Date.parse(at) >= since.getTime())
      .map(([id]) => id),

  setBills(bills: Bill[]) {
    load().bills = bills
    persist()
  },
  upsertBill(bill: Bill) {
    const s = load()
    const i = s.bills.findIndex((b) => b.id === bill.id)
    if (i >= 0) s.bills[i] = bill
    else s.bills.push(bill)
    persist()
  },
  /** Removed bills are kept aside so a later reminder email for the same bill is ignored too. */
  deleteBill(id: string) {
    const s = load()
    const bill = s.bills.find((b) => b.id === id)
    if (!bill) return
    s.bills = s.bills.filter((b) => b.id !== id)
    s.dismissed = [...s.dismissed, bill].slice(-500)
    persist()
  },
  dismissed: () => load().dismissed,
  updateSettings(patch: Partial<Settings>): Settings {
    const s = load()
    s.settings = { ...s.settings, ...patch }
    persist()
    return s.settings
  },
  addScan(rec: ScanRecord) {
    const s = load()
    s.scans.push(rec)
    s.scans = s.scans.slice(-50)
    persist()
  },
  markSeen(ids: string[]) {
    const s = load()
    const now = new Date().toISOString()
    for (const id of ids) s.seenMessages[id] ??= now
    // Bound the map: anything older than ~13 months is outside every scan window anyway.
    const cutoff = Date.now() - 400 * 86_400_000
    for (const [id, at] of Object.entries(s.seenMessages)) if (Date.parse(at) < cutoff) delete s.seenMessages[id]
    persist()
  },
  extractionVersion: () => load().extractionVersion,
  setExtractionVersion(v: number) {
    load().extractionVersion = v
    persist()
  },
  setOnboarded(v: boolean) {
    load().onboarded = v
    persist()
  },
  lastRunVersion: () => load().lastRunVersion,
  setLastRunVersion(v: string) {
    load().lastRunVersion = v
    persist()
  },
  setRestartHidden(v: boolean) {
    load().restartHidden = v
    persist()
  },
  takeRestartHidden() {
    const s = load()
    const hidden = s.restartHidden
    s.restartHidden = false
    persist()
    return hidden
  },
}
