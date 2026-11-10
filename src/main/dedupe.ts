import type { Bill } from '../shared/types.ts'
import { isNothingToPay } from '../shared/bill.ts'
export { isValidRf } from '../shared/rf.ts'

/** Common Greek utility / telecom names and the spellings they show up under in email. */
// `\b` is ASCII-only in JS, so Greek tokens use explicit letter-class boundaries.
const W = '[a-z0-9α-ω]'
const word = (alts: string) => new RegExp(`(^|(?!${W}).)(${alts})((?!${W}).|$)`)

const VENDOR_ALIASES: Array<[RegExp, string]> = [
  [word('deh|dei|ppc|δεη'), 'deh'],
  [/cosmote|κοσμοτε/, 'cosmote'],
  [word('ote|οτε'), 'cosmote'],
  [/vodafone|βονταφον/, 'vodafone'],
  [/\bnova\b|wind|forthnet/, 'nova'],
  [/heron|ηρων/, 'heron'],
  [/protergia|προτεργια/, 'protergia'],
  [/elpedison|ελπεντισον/, 'elpedison'],
  [/zenith|ζενιθ/, 'zenith'],
  [/eydap|εydap|ευδαπ/, 'eydap'],
  [/fysiko aerio|φυσικο αεριο|εδα αττικης|eda attikis|enaon/, 'fysiko-aerio'],
  [/nrg/, 'nrg'],
  [/volton|βολτον/, 'volton'],
]

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function vendorKey(vendor: string): string {
  const v = stripAccents(vendor.toLowerCase()).replace(/\s+/g, ' ').trim()
  for (const [re, key] of VENDOR_ALIASES) if (re.test(v)) return key
  return v.replace(/[^a-z0-9α-ω]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
}

/** RF creditor references: "RF" + 2 check digits + up to 21 alphanumerics. Also accepts plain numeric payment codes. */
export function normalizeRf(rf: string | null | undefined): string | null {
  if (!rf) return null
  const compact = rf.replace(/[\s-]/g, '').toUpperCase()
  return compact.length >= 6 ? compact : null
}

type Codes = Pick<Bill, 'rfCode'> & Partial<Pick<Bill, 'paymentCode'>>

/** The bill's RF and vendor payment codes, normalized. Either one identifies the bill. */
function codesOf(b: Codes): string[] {
  return [normalizeRf(b.rfCode), normalizeRf(b.paymentCode)].filter((c): c is string => c != null)
}

function sharesCode(a: Codes, codes: string[]): boolean {
  return codesOf(a).some((c) => codes.includes(c))
}

function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
}

export function fingerprint(
  b: Pick<Bill, 'vendor' | 'rfCode' | 'accountNumber' | 'dueDate' | 'billingPeriod' | 'issueDate' | 'amount'> &
    Partial<Pick<Bill, 'emailDate' | 'paymentCode'>>,
): string {
  const vk = vendorKey(b.vendor)
  const ref = codesOf(b)[0] ?? (b.accountNumber ? b.accountNumber.replace(/\s/g, '') : '')
  // Without any bill date, the email's day keeps separate monthly charges of the same amount apart.
  const when = b.dueDate ?? b.billingPeriod ?? b.issueDate?.slice(0, 7) ?? b.emailDate?.slice(0, 10) ?? ''
  const amt = ref || when ? '' : String(b.amount ?? '')
  return [vk, ref, when, amt].join('|')
}

type Candidate = Pick<Bill, 'vendor' | 'rfCode' | 'accountNumber' | 'dueDate' | 'billingPeriod' | 'issueDate' | 'amount' | 'gmailMessageIds'> &
  Partial<Pick<Bill, 'emailDate' | 'paymentCode'>>

/**
 * Returns the stored bill that `c` is a re-send, reminder or correction of, if any.
 * Order matters: exact signals first, fuzzier ones only within the same vendor.
 */
export function findDuplicate(existing: Bill[], c: Candidate): Bill | undefined {
  const ids = new Set(c.gmailMessageIds)
  const byMessage = existing.find((b) => b.gmailMessageIds.some((id) => ids.has(id)))
  if (byMessage) return byMessage

  const fp = fingerprint(c)
  const byFp = existing.find((b) => b.fingerprint === fp)
  if (byFp) return byFp

  const vk = vendorKey(c.vendor)
  const codes = codesOf(c)
  const hasCode = codes.length > 0
  const sameVendor = existing.filter((b) => vendorKey(b.vendor) === vk)

  if (hasCode) {
    // Reminder emails for the same bill sometimes shift the due date by a day or two,
    // and may show only one of the bill's RF and payment codes.
    const m = sameVendor.find(
      (b) => sharesCode(b, codes) && (!b.dueDate || !c.dueDate || dayDiff(b.dueDate, c.dueDate) <= 3),
    )
    if (m) return m
  }

  if (c.amount != null && c.dueDate) {
    const m = sameVendor.find(
      (b) =>
        b.amount != null &&
        Math.abs(b.amount - c.amount!) < 0.005 &&
        b.dueDate != null &&
        dayDiff(b.dueDate, c.dueDate!) <= 1 &&
        (!hasCode || codesOf(b).length === 0),
    )
    if (m) return m
  }

  // Follow-up emails about one charge ("payment failed", then "update your card by …") often
  // give a due date in only one of them. Same amount within a week is the same bill;
  // monthly charges of the same amount are ~30 days apart, so they stay separate.
  if (c.amount != null && c.emailDate && !hasCode) {
    const m = sameVendor.find(
      (b) =>
        codesOf(b).length === 0 &&
        (!b.dueDate || !c.dueDate) &&
        b.amount != null &&
        Math.abs(b.amount - c.amount!) < 0.005 &&
        b.emailDate != null &&
        dayDiff(b.emailDate, c.emailDate!) <= 7,
    )
    if (m) return m
  }
  return undefined
}

/**
 * An automatic payment whose charge date has passed has been taken from the card or account,
 * so it moves to Paid. Failed charges are extracted as manual bills, so they aren't affected.
 */
export function settleChargedAutoPayments(bills: Bill[], today: string, now: string): number {
  let n = 0
  for (const b of bills) {
    if (b.status !== 'unpaid' || !b.isAutomaticPayment || !b.dueDate || b.dueDate >= today) continue
    b.status = 'paid'
    b.paidAt = new Date(`${b.dueDate}T12:00:00`).toISOString()
    b.paidSource = 'auto'
    b.updatedAt = now
    n++
  }
  return n
}

export interface PaymentReceipt {
  vendor: string
  /** An RF or vendor payment code from the receipt, matched against both of the bill's codes. */
  rfCode: string | null
  amount: number | null
  paidDate: string | null
}

/** Find the single unpaid bill a payment-confirmation email refers to. Ambiguous matches return undefined. */
export function matchReceipt(bills: Bill[], r: PaymentReceipt): Bill | undefined {
  const vk = vendorKey(r.vendor)
  // A zero or credit statement can't be what a payment was for.
  const unpaid = bills.filter((b) => b.status === 'unpaid' && vendorKey(b.vendor) === vk && !isNothingToPay(b))
  const rf = normalizeRf(r.rfCode)
  if (rf) {
    const byRf = unpaid.filter((b) => sharesCode(b, [rf]))
    if (byRf.length === 1) return byRf[0]
    if (byRf.length > 1 && r.amount != null) {
      const narrowed = byRf.filter((b) => b.amount != null && Math.abs(b.amount - r.amount!) < 0.005)
      if (narrowed.length === 1) return narrowed[0]
    }
    return undefined
  }
  if (r.amount == null) return undefined
  const byAmount = unpaid.filter(
    (b) =>
      b.amount != null &&
      Math.abs(b.amount - r.amount!) < 0.005 &&
      (!r.paidDate || !b.dueDate || dayDiff(b.dueDate, r.paidDate) <= 45),
  )
  return byAmount.length === 1 ? byAmount[0] : undefined
}

/** A newer statement for the same account replaces an older "nothing to pay" one, which moves to the archive. */
export function archiveSupersededZeroBills(bills: Bill[], incoming: Bill, now: string) {
  const vk = vendorKey(incoming.vendor)
  const codes = codesOf(incoming)
  for (const old of bills) {
    if (old.status !== 'unpaid' || !isNothingToPay(old) || vendorKey(old.vendor) !== vk) continue
    const sameAccount =
      (old.accountNumber != null && old.accountNumber === incoming.accountNumber) ||
      sharesCode(old, codes)
    const older = (old.dueDate ?? old.issueDate ?? '') < (incoming.dueDate ?? incoming.issueDate ?? '')
    if (!sameAccount || !older) continue
    old.status = 'paid'
    old.paidAt = now
    old.paidSource = 'auto'
    old.updatedAt = now
  }
}
