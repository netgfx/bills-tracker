import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  findTicketDuplicate,
  isInside,
  mergeTickets,
  parseSavedAttachment,
  safeFileName,
  sniffTicketFile,
  type ExtractedTicket,
} from './tickets.ts'
import { dueReminder, isPastTicket, parseLocal, ticketEnd } from '../shared/ticket.ts'
import type { Ticket } from '../shared/types.ts'

const NOW = '2030-03-01T10:00:00.000Z'

function extracted(over: Partial<ExtractedTicket> = {}): ExtractedTicket {
  return {
    messageId: 'aaaa0001',
    threadId: 'aaaa0001',
    viewUrl: null,
    emailSubject: 'Order 123: tickets for Example Play',
    emailDate: '2030-02-20T08:00:00Z',
    kind: 'theater',
    title: 'Example Play',
    vendor: 'ExampleTix',
    venue: 'Example Theater',
    address: '1 Sample Street',
    startsAt: '2030-03-10T21:00',
    endsAt: null,
    quantity: 2,
    bookingReference: '#123-456',
    totalAmount: 40,
    currency: 'EUR',
    entries: [
      { label: 'Zone A', seat: 'Row 4, Seat 3', barcodeValue: '1111111111', barcodeFormat: 'qrcode', barcodeImageUrl: null },
      { label: 'Zone A', seat: 'Row 4, Seat 1', barcodeValue: '2222222222', barcodeFormat: null, barcodeImageUrl: null },
    ],
    ticketsUrl: 'https://tickets.example.com/order/123',
    appleWalletUrl: 'https://tickets.example.com/wallet/apple/123',
    googleWalletUrl: 'javascript:alert(1)',
    notes: null,
    ...over,
  }
}

let n = 0
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

test('mergeTickets adds a new booking with its entries and only safe links', () => {
  const tickets: Ticket[] = []
  const r = mergeTickets(tickets, [], [extracted()], [], NOW, newId)
  assert.equal(r.added, 1)
  const [t] = tickets
  assert.equal(t.entries.length, 2)
  assert.equal(t.entries[1].barcodeFormat, 'qrcode', 'a printed value without a format is a QR code')
  assert.equal(t.ticketsUrl, 'https://tickets.example.com/order/123')
  assert.equal(t.googleWalletUrl, null)
  assert.equal(r.targets.get(0), t)
})

test('mergeTickets merges a re-sent email by booking reference and fills gaps', () => {
  const tickets: Ticket[] = []
  mergeTickets(tickets, [], [extracted({ entries: [], ticketsUrl: null })], [], NOW, newId)
  const r = mergeTickets(
    tickets,
    [],
    [extracted({ messageId: 'aaaa0002', emailDate: '2030-02-21T08:00:00Z', bookingReference: '123456' })],
    [],
    NOW,
    newId,
  )
  assert.equal(r.added, 0)
  assert.equal(tickets.length, 1)
  assert.deepEqual(tickets[0].gmailMessageIds, ['aaaa0001', 'aaaa0002'])
  assert.equal(tickets[0].entries.length, 2, 'the email with barcodes wins over a summary without them')
  assert.equal(tickets[0].ticketsUrl, 'https://tickets.example.com/order/123')
})

test('a newer email moves a rescheduled show; an older one does not', () => {
  const tickets: Ticket[] = []
  mergeTickets(tickets, [], [extracted()], [], NOW, newId)
  mergeTickets(tickets, [], [extracted({ messageId: 'b2', emailDate: '2030-02-25T08:00:00Z', startsAt: '2030-03-11T21:00' })], [], NOW, newId)
  assert.equal(tickets[0].startsAt, '2030-03-11T21:00')
  mergeTickets(tickets, [], [extracted({ messageId: 'b3', emailDate: '2030-02-01T08:00:00Z', startsAt: '2030-03-09T21:00' })], [], NOW, newId)
  assert.equal(tickets[0].startsAt, '2030-03-11T21:00')
})

test('without a booking reference, the same title and time is the same ticket', () => {
  const a = extracted({ bookingReference: null })
  const tickets: Ticket[] = []
  mergeTickets(tickets, [], [a], [], NOW, newId)
  assert.ok(findTicketDuplicate(tickets, { ...a, title: 'EXAMPLE PLAY!', gmailMessageIds: ['zz'] }))
  assert.equal(findTicketDuplicate(tickets, { ...a, startsAt: '2030-03-12T21:00', gmailMessageIds: ['zz'] }), undefined)
})

test('removed tickets stay removed, and cancellations mark the booking', () => {
  const tickets: Ticket[] = []
  mergeTickets(tickets, [], [extracted()], [], NOW, newId)
  const dismissed = [tickets.pop()!]
  assert.equal(mergeTickets(tickets, dismissed, [extracted({ messageId: 'resend' })], [], NOW, newId).added, 0)

  mergeTickets(tickets, [], [extracted({ messageId: 'c1', bookingReference: 'ABCD99' })], [], NOW, newId)
  mergeTickets(
    tickets,
    [],
    [],
    [{ messageId: 'c2', vendor: 'exampletix', bookingReference: 'abcd 99', title: null, startsAt: null }],
    NOW,
    newId,
  )
  assert.equal(tickets[0].cancelled, true)
})

test('parseSavedAttachment reads the path the CLI saved a download to', () => {
  const text =
    'Downloaded from Gmail by Anthropic\'s download_gmail_attachment tool: "t.pdf" (application/pdf, 1,024 bytes).\n' +
    '[Resource from gmail at gmail-attachment://abc/0] Binary content (application/pdf, 1KB) saved to C:\\Users\\x\\claude\\projects\\p\\s\\tool-results\\mcp-gmail-blob-1-a.pdf'
  assert.deepEqual(parseSavedAttachment(text), {
    mimeType: 'application/pdf',
    path: 'C:\\Users\\x\\claude\\projects\\p\\s\\tool-results\\mcp-gmail-blob-1-a.pdf',
  })
  assert.equal(parseSavedAttachment('Attachment not found'), null)
})

test('isInside rejects paths that leave the folder', () => {
  const dir = join('/data', 'claude')
  assert.equal(isInside(dir, join(dir, 'projects', 'x.pdf')), true)
  assert.equal(isInside(dir, join(dir, '..', 'secret.pdf')), false)
  assert.equal(isInside(dir, join('/data', 'claude-other', 'x.pdf')), false)
  assert.equal(isInside(dir, dir), false)
})

test('ticket files are recognized by content, not by name', () => {
  const bytes = (s: number[]) => Uint8Array.from([...s, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(sniffTicketFile(bytes([0x25, 0x50, 0x44, 0x46, 0x2d]))?.ext, 'pdf')
  assert.equal(sniffTicketFile(bytes([0x89, 0x50, 0x4e, 0x47]))?.ext, 'png')
  assert.equal(sniffTicketFile(bytes([0xff, 0xd8, 0xff]))?.ext, 'jpg')
  assert.equal(sniffTicketFile(new TextEncoder().encode('<html><script>')), null)
  assert.equal(sniffTicketFile(new TextEncoder().encode('MZ\x90\x00')), null)
})

test('safeFileName keeps Greek letters and drops path tricks', () => {
  assert.equal(safeFileName('Εισιτήρια παράστασης.pdf', 'pdf'), 'Εισιτήρια παράστασης.pdf')
  assert.equal(safeFileName('../../evil.exe', 'pdf'), '_.._evil.pdf')
  assert.equal(safeFileName('a:b*c?.pdf', 'pdf'), 'a_b_c_.pdf')
  assert.equal(safeFileName('', 'png'), 'ticket.png')
})

test('tickets become past a few hours after a timed start, or after check-out', () => {
  assert.equal(parseLocal('2030-02-30'), null)
  const show = { startsAt: '2030-03-10T21:00', endsAt: null }
  assert.equal(isPastTicket(show, new Date(2030, 2, 10, 23, 0)), false)
  assert.equal(isPastTicket(show, new Date(2030, 2, 11, 1, 30)), true)
  const hotel = { startsAt: '2030-03-10', endsAt: '2030-03-12' }
  assert.equal(ticketEnd(hotel)?.getDate(), 12)
  assert.equal(isPastTicket(hotel, new Date(2030, 2, 12, 20, 0)), false)
  assert.equal(isPastTicket({ startsAt: null, endsAt: null }), false)
})

test('dueReminder fires within 24 hours of the start, once', () => {
  const t = { kind: 'theater' as const, title: 'Example Play', venue: 'Example Theater', startsAt: '2030-03-10T21:00', cancelled: false, remindedAt: null }
  assert.equal(dueReminder(t, new Date(2030, 2, 9, 20, 0)), null)
  assert.deepEqual(dueReminder(t, new Date(2030, 2, 9, 22, 0)), {
    title: 'Tomorrow at 21:00: Example Play',
    body: 'At Example Theater. Your tickets are in Bills Tracker.',
  })
  assert.equal(dueReminder(t, new Date(2030, 2, 10, 9, 0))?.title, 'Today at 21:00: Example Play')
  assert.equal(dueReminder({ ...t, remindedAt: NOW }, new Date(2030, 2, 9, 22, 0)), null)
  assert.equal(dueReminder({ ...t, cancelled: true }, new Date(2030, 2, 9, 22, 0)), null)
  const hotel = { ...t, kind: 'hotel' as const, title: 'Sample Hotel', startsAt: '2030-03-10' }
  assert.equal(dueReminder(hotel, new Date(2030, 2, 9, 12, 0))?.title, 'Tomorrow: check-in at Sample Hotel')
})
