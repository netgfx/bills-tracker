import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitPaymentCodes } from '../shared/rf.ts'

test('an email with both an RF code and a vendor payment code keeps both', () => {
  assert.deepEqual(splitPaymentCodes('RF18 5390 0754 7034', '0123456789012'), {
    rfCode: 'RF18 5390 0754 7034',
    paymentCode: '0123456789012',
  })
})

test('a vendor payment code filed as the RF code moves to the payment code', () => {
  assert.deepEqual(splitPaymentCodes('0123 4567 8901 3', null), { rfCode: null, paymentCode: '0123 4567 8901 3' })
})

test('codes the scanner put in each other\'s field are swapped back', () => {
  assert.deepEqual(splitPaymentCodes('0123456789012', 'rf18 5390 0754 7034'), {
    rfCode: 'rf18 5390 0754 7034',
    paymentCode: '0123456789012',
  })
})

test('an RF code given only as the payment code moves to the RF code', () => {
  assert.deepEqual(splitPaymentCodes(null, 'RF18 5390 0754 7034'), { rfCode: 'RF18 5390 0754 7034', paymentCode: null })
})

test('the same code reported in both fields is kept once', () => {
  assert.deepEqual(splitPaymentCodes('0123 4567 8901 3', '0123456789013'), { rfCode: null, paymentCode: '0123456789013' })
  assert.deepEqual(splitPaymentCodes('RF18 5390 0754 7034', 'RF18539007547034'), { rfCode: 'RF18 5390 0754 7034', paymentCode: null })
})
