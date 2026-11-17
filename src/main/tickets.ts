import { isAbsolute, relative, resolve } from 'node:path'
import type { BarcodeFormat, Ticket, TicketEntry, TicketKind } from '../shared/types.ts'
import { safeHttpsUrl } from '../shared/bill.ts'
import { stripAccents, vendorKey } from './dedupe.ts'

/** A ticket or booking as the scan extracted it from one email. */
export interface ExtractedTicket {
  messageId: string
  threadId: string | null
  viewUrl: string | null
  emailSubject: string
  emailDate: string | null
  kind: TicketKind
  title: string
  vendor: string
  venue: string | null
  address: string | null
  startsAt: string | null
  endsAt: string | null
  quantity: number | null
  bookingReference: string | null
  totalAmount: number | null
  currency: string
  entries: Array<{
    label: string | null
    seat: string | null
    barcodeValue: string | null
    barcodeFormat: BarcodeFormat | null
    barcodeImageUrl: string | null
  }>
  ticketsUrl: string | null
  appleWalletUrl: string | null
  googleWalletUrl: string | null
  notes: string | null
}

export interface ExtractedCancellation {
  messageId: string
  vendor: string
  bookingReference: string | null
  title: string | null
  startsAt: string | null
}

function norm(s: string | null | undefined): string {
  return stripAccents((s ?? '').toLowerCase()).replace(/[^a-z0-9α-ω]+/g, '')
}

function refKey(r: string | null | undefined): string {
  return (r ?? '').replace(/[\s#-]/g, '').toUpperCase()
}

type Identity = Pick<Ticket, 'vendor' | 'title' | 'startsAt' | 'bookingReference' | 'gmailMessageIds'>

/** The stored ticket that `c` is a re-send, update or reminder of, if any. */
export function findTicketDuplicate(existing: Ticket[], c: Identity): Ticket | undefined {
  const ids = new Set(c.gmailMessageIds)
  const byMessage = existing.find((t) => t.gmailMessageIds.some((id) => ids.has(id)))
  if (byMessage) return byMessage
  const ref = refKey(c.bookingReference)
  if (ref.length >= 4) {
    const vk = vendorKey(c.vendor)
    const byRef = existing.find((t) => refKey(t.bookingReference) === ref && vendorKey(t.vendor) === vk)
    if (byRef) return byRef
  }
  const title = norm(c.title)
  if (title && c.startsAt) {
    return existing.find((t) => norm(t.title) === title && t.startsAt === c.startsAt)
  }
  return undefined
}

function cleanEntries(x: ExtractedTicket): TicketEntry[] {
  return x.entries
    .map((e) => ({
      label: e.label?.trim() || null,
      seat: e.seat?.trim() || null,
      barcodeValue: e.barcodeValue?.trim() || null,
      barcodeFormat: e.barcodeValue?.trim() ? (e.barcodeFormat ?? 'qrcode') : null,
      barcodeImage: null,
    }))
    .slice(0, 40)
}

function hasCodes(entries: TicketEntry[]): boolean {
  return entries.some((e) => e.barcodeValue || e.barcodeImage)
}

export interface TicketMergeResult {
  added: number
  updated: number
  /** Which stored ticket each extracted one landed in, by the extracted ticket's index. Dismissed ones are absent. */
  targets: Map<number, Ticket>
}

/**
 * Merges a scan's tickets into `tickets` in place. A newer email for the same booking
 * (a change of date, a reminder with the barcodes) wins on what it states; gaps are always filled.
 */
export function mergeTickets(
  tickets: Ticket[],
  dismissed: Ticket[],
  extracted: ExtractedTicket[],
  cancellations: ExtractedCancellation[],
  now: string,
  newId: () => string,
): TicketMergeResult {
  let added = 0
  let updated = 0
  const targets = new Map<number, Ticket>()

  extracted.forEach((x, i) => {
    const candidate = {
      vendor: x.vendor.trim(),
      title: x.title.trim(),
      startsAt: x.startsAt,
      bookingReference: x.bookingReference?.trim() || null,
      gmailMessageIds: [x.messageId],
    }
    if (findTicketDuplicate(dismissed, candidate)) return
    const entries = cleanEntries(x)
    const links = {
      ticketsUrl: safeHttpsUrl(x.ticketsUrl),
      appleWalletUrl: safeHttpsUrl(x.appleWalletUrl),
      googleWalletUrl: safeHttpsUrl(x.googleWalletUrl),
    }
    const dup = findTicketDuplicate(tickets, candidate)
    if (dup) {
      const sameEmail = dup.gmailMessageIds.includes(x.messageId)
      const newer = !sameEmail && (!dup.emailDate || !x.emailDate || Date.parse(x.emailDate) >= Date.parse(dup.emailDate))
      const pick = <T>(theirs: T | null, ours: T | null): T | null => (newer ? (theirs ?? ours) : (ours ?? theirs))
      Object.assign(dup, {
        gmailMessageIds: sameEmail ? dup.gmailMessageIds : [...dup.gmailMessageIds, x.messageId],
        venue: pick(x.venue, dup.venue),
        address: pick(x.address, dup.address),
        startsAt: pick(x.startsAt, dup.startsAt),
        endsAt: pick(x.endsAt, dup.endsAt),
        quantity: pick(x.quantity, dup.quantity),
        bookingReference: dup.bookingReference ?? candidate.bookingReference,
        totalAmount: dup.totalAmount ?? x.totalAmount,
        ticketsUrl: pick(links.ticketsUrl, dup.ticketsUrl),
        appleWalletUrl: pick(links.appleWalletUrl, dup.appleWalletUrl),
        googleWalletUrl: pick(links.googleWalletUrl, dup.googleWalletUrl),
        // Barcodes from the email that has them beat an order summary without them.
        entries: !hasCodes(dup.entries) && (hasCodes(entries) || entries.length > dup.entries.length) ? entries : dup.entries,
        notes: dup.notes ?? x.notes,
        updatedAt: now,
      } satisfies Partial<Ticket>)
      targets.set(i, dup)
      updated++
      return
    }
    const ticket: Ticket = {
      id: newId(),
      kind: x.kind,
      ...candidate,
      venue: x.venue,
      address: x.address,
      endsAt: x.endsAt,
      quantity: x.quantity,
      totalAmount: x.totalAmount,
      currency: x.currency || 'EUR',
      entries,
      ...links,
      attachments: [],
      cancelled: false,
      remindedAt: null,
      emailSubject: x.emailSubject,
      emailDate: x.emailDate,
      gmailThreadId: x.threadId,
      gmailViewUrl: x.viewUrl,
      notes: x.notes,
      createdAt: now,
      updatedAt: now,
    }
    tickets.push(ticket)
    targets.set(i, ticket)
    added++
  })

  for (const c of cancellations) {
    const t = findTicketDuplicate(tickets, {
      vendor: c.vendor,
      title: c.title ?? '',
      startsAt: c.startsAt,
      bookingReference: c.bookingReference,
      gmailMessageIds: [c.messageId],
    })
    if (!t || t.cancelled) continue
    t.cancelled = true
    t.gmailMessageIds = [...new Set([...t.gmailMessageIds, c.messageId])]
    t.updatedAt = now
    updated++
  }
  return { added, updated, targets }
}

/* ---------- Attachments saved by the Gmail connector ---------- */

export interface SavedAttachment {
  path: string
  mimeType: string
}

/**
 * Reads where the CLI saved a downloaded attachment from the tool result's text:
 * "… Binary content (application/pdf, 147.6KB) saved to <path>". The file only exists while the scan runs.
 */
export function parseSavedAttachment(text: string): SavedAttachment | null {
  const m = /Binary content \(([\w.+-]+\/[\w.+-]+)[^)]*\) saved to (.+?)\s*$/m.exec(text)
  return m ? { mimeType: m[1].toLowerCase(), path: m[2] } : null
}

/** True when `file` resolves inside `dir`. Paths come from tool output, so nothing outside the Claude folder is copied. */
export function isInside(dir: string, file: string): boolean {
  const rel = relative(resolve(dir), resolve(file))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

/** Ticket files the app keeps, by their first bytes, so a renamed web page or program is never stored. */
export function sniffTicketFile(head: Uint8Array): { mimeType: string; ext: string } | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b)
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mimeType: 'application/pdf', ext: 'pdf' }
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { mimeType: 'image/png', ext: 'png' }
  if (starts(0xff, 0xd8, 0xff)) return { mimeType: 'image/jpeg', ext: 'jpg' }
  if (starts(0x47, 0x49, 0x46, 0x38)) return { mimeType: 'image/gif', ext: 'gif' }
  // Wallet passes are zip files; only accepted when the email named them .pkpass (checked by the caller).
  if (starts(0x50, 0x4b, 0x03, 0x04)) return { mimeType: 'application/vnd.apple.pkpass', ext: 'pkpass' }
  return null
}

/** A file name safe on Windows and macOS, keeping Greek letters, with the extension the content proved. */
export function safeFileName(name: string, ext: string): string {
  const base = name
    .replace(/\.[^.]*$/, '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '_')
    .replace(/^[ .]+|[ .]+$/g, '')
    .slice(0, 80)
  return `${base || 'ticket'}.${ext}`
}
