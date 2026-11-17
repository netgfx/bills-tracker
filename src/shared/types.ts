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

export type TicketKind = 'theater' | 'cinema' | 'event' | 'hotel' | 'other'

export type BarcodeFormat = 'qrcode' | 'code128' | 'pdf417' | 'aztec' | 'datamatrix'

/** One admission or guest on a booking: its seat and the code scanned at the door. */
export interface TicketEntry {
  label: string | null
  seat: string | null
  /** The value the email prints with the barcode, rendered locally. Never guessed from an image. */
  barcodeValue: string | null
  barcodeFormat: BarcodeFormat | null
  /** A barcode image saved from the email when it didn't print the value, inside the tickets folder. */
  barcodeImage: string | null
}

/** A ticket file from the email (PDF, image or wallet pass), copied into the app's tickets folder. */
export interface TicketAttachment {
  filename: string
  mimeType: string
  /** File name inside this ticket's folder. Never a path from email or the renderer. */
  file: string
  size: number
}

export interface Ticket {
  id: string
  kind: TicketKind
  /** The show, film, event or hotel name. */
  title: string
  /** Who sold it: the ticketing site, cinema chain or booking site. */
  vendor: string
  venue: string | null
  address: string | null
  /** Local time, "YYYY-MM-DDTHH:mm", or "YYYY-MM-DD" when the email gives no time. Check-in for hotels. */
  startsAt: string | null
  /** Check-out for hotels, end time for events when given. Same format as startsAt. */
  endsAt: string | null
  quantity: number | null
  bookingReference: string | null
  totalAmount: number | null
  currency: string
  entries: TicketEntry[]
  /** Https links from the email. Opened only through `openTicketLink`. */
  ticketsUrl: string | null
  appleWalletUrl: string | null
  googleWalletUrl: string | null
  attachments: TicketAttachment[]
  cancelled: boolean
  /** When the day-before reminder was shown, so it's shown once. */
  remindedAt: string | null
  emailSubject: string
  emailDate: string | null
  gmailMessageIds: string[]
  gmailThreadId: string | null
  gmailViewUrl: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type TicketLink = 'tickets' | 'apple' | 'google'

export type ScanTrigger ='schedule' | 'startup-catchup' | 'manual' | 'resume'

export interface ScanRecord {
  startedAt: string
  finishedAt: string | null
  trigger: ScanTrigger
  ok: boolean
  added: number
  updated: number
  autoPaid: number
  /** New tickets and bookings found. Missing on scans from before tickets existed. */
  ticketsAdded?: number
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
  /** A notification the day before an event or hotel check-in. */
  ticketReminders: boolean
  model: string
}

export const DEFAULT_SETTINGS: Settings = {
  scanTimes: ['08:00', '20:00'],
  openAtLogin: true,
  firstScanLookbackDays: 60,
  notifyDaysBefore: 3,
  autoMarkPaidFromReceipts: true,
  autoUpdate: true,
  ticketReminders: true,
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
  tickets: Ticket[]
  settings: Settings
  scan: ScanState
  onboarded: boolean
  appVersion: string
  /** For wording that differs by OS: "Start with Windows", "Ctrl F" vs "⌘F". */
  platform: 'win32' | 'darwin' | 'linux'
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
  deleteTicket(id: string): Promise<void>
  openTicketLink(id: string, link: TicketLink): Promise<void>
  /** Opens a ticket's PDF or image in the system viewer, where it can be printed. */
  openTicketAttachment(id: string, index: number): Promise<void>
  /** An image attachment or saved barcode image as a data: URL, for showing and printing in the app. */
  ticketImage(id: string, file: string): Promise<string>
  sendTestNotification(): Promise<void>
  onSnapshot(cb: (s: AppSnapshot) => void): () => void
  onLoginEvent(cb: (e: LoginEvent) => void): () => void
  onFocusSearch(cb: () => void): () => void
}
