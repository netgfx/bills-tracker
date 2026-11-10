export type BillCategory = 'electricity' | 'phone' | 'gas' | 'other'

export type BillStatus = 'unpaid' | 'paid'

export interface Bill {
  id: string
  /** Stable identity used to collapse reminders / re-sends of the same bill. */
  fingerprint: string
  vendor: string
  category: BillCategory
  amount: number | null
  currency: string
  dueDate: string | null // YYYY-MM-DD
  issueDate: string | null
  /** RF creditor reference (ISO 11649), e.g. "RF18 5390 …". */
  rfCode: string | null
  /** The vendor's own payment code when the email gives one besides (or instead of) an RF code. */
  paymentCode: string | null
  accountNumber: string | null
  customerCode: string | null
  /** The email's link for paying this bill online. Always https; opened only through `openPaymentLink`. */
  paymentUrl: string | null
  billingPeriod: string | null
  isAutomaticPayment: boolean
  status: BillStatus
  paidAt: string | null
  /**
   * 'user' when marked paid in the app, 'email' when a payment receipt email matched it,
   * 'auto' when a zero/credit statement was replaced by a newer one for the same account.
   */
  paidSource: 'user' | 'email' | 'auto' | null
  emailSubject: string
  emailDate: string | null
  gmailMessageIds: string[]
  gmailThreadId: string | null
  gmailViewUrl: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ScanTrigger = 'schedule' | 'startup-catchup' | 'manual' | 'resume'

export interface ScanRecord {
  startedAt: string
  finishedAt: string | null
  trigger: ScanTrigger
  ok: boolean
  added: number
  updated: number
  autoPaid: number
  emailsReviewed: number
  error: string | null
}

export interface Settings {
  scanTimes: string[] // "HH:MM", local time
  openAtLogin: boolean
  firstScanLookbackDays: number
  notifyDaysBefore: number
  autoMarkPaidFromReceipts: boolean
  autoUpdate: boolean
  model: string
}

export const DEFAULT_SETTINGS: Settings = {
  scanTimes: ['08:00', '20:00'],
  openAtLogin: true,
  firstScanLookbackDays: 60,
  notifyDaysBefore: 3,
  autoMarkPaidFromReceipts: true,
  autoUpdate: true,
  model: 'claude-opus-5-5',
}

export interface AuthStatus {
  loggedIn: boolean
  email: string | null
  subscriptionType: string | null
  authMethod: string | null
  error: string | null
}

export type GmailStatus =
  | { state: 'connected' }
  | { state: 'needs-auth' }
  | { state: 'missing' }
  | { state: 'failed'; error: string }

export type LoginEvent =
  | { type: 'url'; url: string }
  | { type: 'waiting-for-code' }
  | { type: 'done'; status: AuthStatus }
  | { type: 'error'; message: string }

export interface ScanState {
  running: boolean
  phase: string | null
  /** Set when scans can't run until the user acts: sign in again, or reconnect Gmail. */
  blocked: 'auth' | 'gmail' | null
  lastScan: ScanRecord | null
  nextScanAt: string | null
}

export interface AppSnapshot {
  bills: Bill[]
  settings: Settings
  scan: ScanState
  onboarded: boolean
  appVersion: string
}

export interface BillsApi {
  getSnapshot(): Promise<AppSnapshot>
  setPaid(id: string, paid: boolean): Promise<Bill>
  deleteBill(id: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  scanNow(): Promise<ScanRecord | null>
  cancelScan(): Promise<void>
  authStatus(): Promise<AuthStatus>
  startLogin(opts: { sso: boolean; email?: string }): Promise<void>
  submitLoginCode(code: string): Promise<void>
  cancelLogin(): Promise<void>
  logout(): Promise<void>
  gmailStatus(): Promise<GmailStatus>
  completeOnboarding(): Promise<void>
  openExternal(url: string): Promise<void>
  openPaymentLink(billId: string): Promise<void>
  copyText(text: string): Promise<void>
  onSnapshot(cb: (s: AppSnapshot) => void): () => void
  onLoginEvent(cb: (e: LoginEvent) => void): () => void
  onFocusSearch(cb: () => void): () => void
}
