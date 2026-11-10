import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archiveSupersededZeroBills, settleChargedAutoPayments, findDuplicate, fingerprint, isValidRf, matchReceipt, normalizeRf, vendorKey } from './dedupe.ts'
import type { Bill } from '../shared/types.ts'

function bill(p: Partial<Bill>): Bill {
  const base = {
    id: 'x', vendor: 'ΔΕΗ', category: 'electricity', amount: 84.2, currency: 'EUR', dueDate: '2026-11-05',
    issueDate: null, rfCode: 'RF18 0012 3456 7890', paymentCode: null, accountNumber: null, customerCode: null, paymentUrl: null, billingPeriod: null,
    isAutomaticPayment: false, status: 'unpaid', paidAt: null, paidSource: null, emailSubject: '',
    emailDate: null, gmailMessageIds: ['m1'], gmailThreadId: null, notes: null, createdAt: '', updatedAt: '',
  } as Omit<Bill, 'fingerprint'>
  const b = { ...base, ...p } as Bill
  b.fingerprint = fingerprint(b)
  return b
}

test('vendorKey folds Greek and Latin spellings', () => {
  assert.equal(vendorKey('ΔΕΗ'), 'deh')
  assert.equal(vendorKey('DEI S.A.'), 'deh')
  assert.equal(vendorKey('ΔΕΗ Α.Ε. - Λογαριασμός'), 'deh')
  assert.equal(vendorKey('COSMOTE Telecom'), 'cosmote')
  assert.equal(vendorKey('ΟΤΕ'), 'cosmote')
  assert.equal(vendorKey('Ποτέ'), 'ποτε') // no false OTE match inside a word
  assert.equal(vendorKey('Nova'), 'nova')
})

test('normalizeRf strips spacing', () => {
  assert.equal(normalizeRf('rf18 0012-3456'), 'RF1800123456')
  assert.equal(normalizeRf('12'), null)
})

test('isValidRf checks mod-97', () => {
  assert.equal(isValidRf('RF18 5390 0754 7034'), true)
  assert.equal(isValidRf('RF19 5390 0754 7034'), false)
})

test('reminder with same RF is a duplicate', () => {
  const existing = [bill({})]
  const dup = findDuplicate(existing, { ...bill({ gmailMessageIds: ['m2'], dueDate: '2026-11-06', vendor: 'DEI' }) })
  assert.equal(dup?.id, 'x')
})

test('same message id is a duplicate even if fields differ', () => {
  const existing = [bill({})]
  assert.ok(findDuplicate(existing, bill({ vendor: 'Other', rfCode: null, gmailMessageIds: ['m1'] })))
})

test('next month bill with a static RF is not a duplicate', () => {
  const existing = [bill({})]
  assert.equal(findDuplicate(existing, bill({ gmailMessageIds: ['m3'], dueDate: '2026-12-05' })), undefined)
})

test('receipt matches by RF, ambiguity returns undefined', () => {
  const a = bill({ id: 'a', rfCode: null, gmailMessageIds: ['a'], amount: 30 })
  const b = bill({ id: 'b', rfCode: null, gmailMessageIds: ['b'], amount: 30, dueDate: '2026-11-20' })
  assert.equal(matchReceipt([a, b], { vendor: 'ΔΕΗ', rfCode: null, amount: 30, paidDate: '2026-11-04' }), undefined)
  const c = bill({ id: 'c' })
  assert.equal(matchReceipt([c], { vendor: 'DEH', rfCode: 'RF1800123456 7890', amount: null, paidDate: null })?.id, 'c')
})

test('receipts never match a zero statement', () => {
  const zero = bill({ id: 'z', vendor: 'Cosmote', category: 'phone', amount: 0, rfCode: 'RF18539007547034' })
  assert.equal(matchReceipt([zero], { vendor: 'Cosmote', rfCode: 'RF18539007547034', amount: 0, paidDate: null }), undefined)
})

test('a newer bill for the same account archives the older zero statement', () => {
  const zero = bill({ id: 'z', vendor: 'Cosmote', amount: 0, rfCode: null, accountNumber: '1234567890123456', dueDate: '2026-11-06' })
  const other = bill({ id: 'o', vendor: 'Cosmote', amount: 0, rfCode: null, accountNumber: '999', dueDate: '2026-11-06', gmailMessageIds: ['o'] })
  const next = bill({ id: 'n', vendor: 'COSMOTE', amount: 18.5, rfCode: null, accountNumber: '1234567890123456', dueDate: '2026-12-06', gmailMessageIds: ['n'] })
  archiveSupersededZeroBills([zero, other], next, '2026-11-08T00:00:00Z')
  assert.equal(zero.status, 'paid')
  assert.equal(zero.paidSource, 'auto')
  assert.equal(other.status, 'unpaid') // different account stays
})

test('follow-up emails about one failed charge merge, monthly charges do not', () => {
  const failed = bill({ id: 'f', vendor: 'Coursera', category: 'other', rfCode: null, amount: 42, dueDate: null, emailDate: '2026-09-21T11:24:00Z' })
  const followUp = { ...bill({ vendor: 'Coursera', rfCode: null, amount: 42, dueDate: '2026-09-28', gmailMessageIds: ['g'] }), emailDate: '2026-09-22T15:06:17Z' }
  assert.equal(findDuplicate([failed], followUp)?.id, 'f')
  const nextMonth = { ...followUp, gmailMessageIds: ['h'], dueDate: null, emailDate: '2026-10-21T11:24:00Z' }
  assert.equal(findDuplicate([failed], nextMonth), undefined)
})

test('automatic payments past their charge date move to Paid', () => {
  const past = bill({ id: 'p', vendor: 'Google One', isAutomaticPayment: true, dueDate: '2026-09-28', rfCode: null })
  const upcoming = bill({ id: 'u', vendor: 'Papaki', isAutomaticPayment: true, dueDate: '2026-10-30', rfCode: null })
  const manual = bill({ id: 'm', dueDate: '2026-09-01' })
  assert.equal(settleChargedAutoPayments([past, upcoming, manual], '2026-10-24', 'now'), 1)
  assert.equal(past.status, 'paid')
  assert.equal(past.paidSource, 'auto')
  assert.equal(upcoming.status, 'unpaid')
  assert.equal(manual.status, 'unpaid') // overdue manual bills are never auto-settled
})
