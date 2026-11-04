import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gmailEmailUrl, safePaymentUrl } from '../shared/bill.ts'

test('gmailEmailUrl links to the message itself, in the right account', () => {
  const viewUrl = 'https://mail.google.com/mail/?authuser=me@gmail.com#all/thread-f:1234567890123456789|msg-f:1234567890123456789'
  assert.equal(
    gmailEmailUrl({ gmailMessageIds: ['aaaabbbbcccc0001', 'aaaabbbbcccc0002'], gmailViewUrl: viewUrl }),
    'https://mail.google.com/mail/?authuser=me@gmail.com#all/aaaabbbbcccc0001',
  )
  assert.equal(
    gmailEmailUrl({ gmailMessageIds: ['aaaabbbbcccc0001'], gmailViewUrl: 'not a url' }),
    'https://mail.google.com/mail/u/0/#all/aaaabbbbcccc0001',
  )
  assert.equal(
    gmailEmailUrl({ gmailMessageIds: ['aaaabbbbcccc0001'], gmailViewUrl: null }),
    'https://mail.google.com/mail/u/0/#all/aaaabbbbcccc0001',
  )
  assert.equal(gmailEmailUrl({ gmailMessageIds: [], gmailViewUrl: null }), null)
})

test('safePaymentUrl keeps only plain https links', () => {
  assert.equal(safePaymentUrl(' https://www.dei.gr/el/pay?ref=1 '), 'https://www.dei.gr/el/pay?ref=1')
  assert.equal(safePaymentUrl('http://www.dei.gr/pay'), null)
  assert.equal(safePaymentUrl('javascript:alert(1)'), null)
  assert.equal(safePaymentUrl('https://user:pw@example.com/'), null)
  assert.equal(safePaymentUrl('not a url'), null)
  assert.equal(safePaymentUrl(null), null)
})
