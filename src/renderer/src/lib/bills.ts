import type { Bill, BillCategory } from '@shared/types'
import { isNothingToPay } from '@shared/bill'

export { isNothingToPay }

export type GroupId = 'due' | BillCategory | 'auto' | 'paid'

export const GROUPS: Array<{ id: GroupId; label: string; hint: string }> = [
  { id: 'due', label: 'To pay', hint: 'Every bill you still have to pay yourself' },
  { id: 'electricity', label: 'Electricity', hint: 'Power suppliers like ΔΕΗ' },
  { id: 'phone', label: 'Phone & internet', hint: 'Mobile, landline and broadband' },
  { id: 'gas', label: 'Gas', hint: 'Natural gas suppliers' },
  { id: 'other', label: 'Other', hint: 'Water, insurance, taxes and the rest' },
  { id: 'auto', label: 'Automatic payments', hint: 'Charged to your card or account without action' },
  { id: 'paid', label: 'Paid', hint: 'Bills you marked as paid' },
]

export function inGroup(b: Bill, g: GroupId): boolean {
  if (g === 'paid') return b.status === 'paid'
  if (b.status === 'paid') return false
  if (g === 'auto') return b.isAutomaticPayment
  if (b.isAutomaticPayment) return false
  return g === 'due' || b.category === g
}

export type Urgency = 'overdue' | 'soon' | 'week' | 'later' | 'undated' | 'nothing'

export const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: 'Overdue',
  soon: 'Due in the next 3 days',
  week: 'Due this week',
  later: 'Due later',
  undated: 'No due date found',
  nothing: 'Nothing to pay',
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Whole days from today to the due date; negative when overdue. */
export function daysUntil(dueDate: string): number {
  const [y, m, d] = dueDate.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  return Math.round((due.getTime() - startOfToday().getTime()) / 86_400_000)
}

export function urgencyOf(b: Bill): Urgency {
  if (isNothingToPay(b)) return 'nothing'
  if (!b.dueDate) return 'undated'
  const n = daysUntil(b.dueDate)
  if (n < 0) return 'overdue'
  if (n <= 3) return 'soon'
  if (n <= 7) return 'week'
  return 'later'
}

export function duePhrase(b: Bill): string {
  if (isNothingToPay(b)) return b.amount! < 0 ? 'Credit, nothing to pay' : 'Nothing to pay'
  if (!b.dueDate) return 'No due date'
  const n = daysUntil(b.dueDate)
  if (b.isAutomaticPayment) return n < 0 ? 'Charged' : n === 0 ? 'Charges today' : `Charges in ${n} ${n === 1 ? 'day' : 'days'}`
  if (n < -1) return `${-n} days overdue`
  if (n === -1) return 'Due yesterday'
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  return `Due in ${n} days`
}

export function sortByDue(a: Bill, b: Bill): number {
  if (!a.dueDate && !b.dueDate) return (b.emailDate ?? '').localeCompare(a.emailDate ?? '')
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return a.dueDate.localeCompare(b.dueDate)
}

export function sortByPaid(a: Bill, b: Bill): number {
  return (b.paidAt ?? '').localeCompare(a.paidAt ?? '')
}

const eur = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
const plain = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatAmount(b: Pick<Bill, 'amount' | 'currency'>): string {
  if (b.amount == null) return 'Amount not found'
  const fmt = b.currency && b.currency !== 'EUR' ? new Intl.NumberFormat('el-GR', { style: 'currency', currency: b.currency }) : eur
  return b.amount < 0 ? `${fmt.format(-b.amount)} credit` : fmt.format(b.amount)
}

/** What lands on the clipboard: the number as Greek e-banking forms expect it, no currency sign. */
export function amountForClipboard(amount: number): string {
  return plain.format(amount).replace(/\./g, '')
}

/** Only bills with something to pay count toward totals; credits don't offset other bills. */
export function payable(bills: Bill[]): Bill[] {
  return bills.filter((b) => !isNothingToPay(b))
}

export function payableTotal(bills: Bill[]): number {
  return payable(bills).reduce((s, b) => s + (b.amount ?? 0), 0)
}

export function formatTotal(n: number): string {
  return eur.format(n)
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

export function formatDate(iso: string | null, withYear = true): string {
  if (!iso) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return withYear && !sameYear ? dateFmt.format(d) : shortFmt.format(d)
}

export function groupRf(rf: string): string {
  return rf.replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}

export function rfForClipboard(rf: string): string {
  return rf.replace(/\s/g, '')
}

export interface Filters {
  query: string
  from: string | null // YYYY-MM-DD, compared against due date (or email date when undated)
  to: string | null
  min: number | null
  max: number | null
}

export const EMPTY_FILTERS: Filters = { query: '', from: null, to: null, min: null, max: null }

export function hasFilters(f: Filters): boolean {
  return Boolean(f.query.trim() || f.from || f.to || f.min != null || f.max != null)
}

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const CATEGORY_WORDS: Record<BillCategory, string> = {
  electricity: 'electricity power ρευμα ηλεκτρικο',
  phone: 'phone mobile internet τηλεφωνο κινητο',
  gas: 'gas αεριο',
  other: 'other',
}

/** Search spans every bill, paid or not. Each whitespace-separated term must match somewhere. */
export function applyFilters(bills: Bill[], f: Filters): Bill[] {
  const terms = fold(f.query).split(/\s+/).filter(Boolean)
  return bills.filter((b) => {
    const when = b.dueDate ?? b.emailDate?.slice(0, 10) ?? null
    if (f.from && (!when || when < f.from)) return false
    if (f.to && (!when || when > f.to)) return false
    if (f.min != null && (b.amount == null || b.amount < f.min)) return false
    if (f.max != null && (b.amount == null || b.amount > f.max)) return false
    if (!terms.length) return true
    const hay = fold(
      [
        b.vendor,
        b.rfCode ?? '',
        b.rfCode?.replace(/\s/g, '') ?? '',
        b.accountNumber ?? '',
        b.customerCode ?? '',
        b.emailSubject,
        b.billingPeriod ?? '',
        b.notes ?? '',
        CATEGORY_WORDS[b.category],
        b.isAutomaticPayment ? 'automatic auto direct debit παγια' : '',
        b.status === 'paid' ? 'paid archived' : 'unpaid due',
        isNothingToPay(b) ? 'zero nothing credit μηδενικος πιστωτικος' : '',
        b.amount != null ? `${b.amount.toFixed(2)} ${b.amount.toFixed(2).replace('.', ',')}` : '',
      ].join(' '),
    )
    return terms.every((t) => hay.includes(t))
  })
}
