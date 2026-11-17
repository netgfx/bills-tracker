import { randomUUID } from 'node:crypto'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { claudeConfigDir, ticketsDir } from './paths.ts'
import { isInside, MAX_ATTACHMENT_BYTES, parseSavedAttachment, safeFileName, sniffTicketFile } from './tickets.ts'
import { safeHttpsUrl } from '../shared/bill.ts'
import type { Ticket } from '../shared/types.ts'

/** An attachment copied out of the CLI's temporary folder during a scan, waiting to be filed under its ticket. */
export interface StagedAttachment {
  messageId: string
  filename: string
  mimeType: string
  ext: string
  staged: string
  size: number
}

function stagingDir(): string {
  const dir = join(ticketsDir(), '.incoming')
  mkdirSync(dir, { recursive: true })
  return dir
}

function readHead(file: string): Uint8Array {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(8)
    readSync(fd, buf, 0, 8, 0)
    return buf
  } finally {
    closeSync(fd)
  }
}

/**
 * Copies a file the Gmail connector just downloaded, before the CLI deletes it when the scan ends.
 * Only files inside the app's own Claude folder, of a ticket type proven by their content, are kept.
 */
export function stageAttachment(toolResultText: string, messageId: string, filename: string): StagedAttachment | null {
  const saved = parseSavedAttachment(toolResultText)
  if (!saved || !isInside(claudeConfigDir(), saved.path) || !existsSync(saved.path)) return null
  const size = statSync(saved.path).size
  if (size === 0 || size > MAX_ATTACHMENT_BYTES) return null
  const type = sniffTicketFile(readHead(saved.path))
  if (!type || (type.ext === 'pkpass' && !/\.pkpass$/i.test(filename))) return null
  const staged = join(stagingDir(), `${randomUUID()}.${type.ext}`)
  copyFileSync(saved.path, staged)
  return { messageId, filename, mimeType: type.mimeType, ext: type.ext, staged, size }
}

function ticketFolder(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Bad ticket id')
  const dir = join(ticketsDir(), id)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Moves a staged file into the ticket's folder, unless the ticket already has a file by that name. */
export function fileAttachment(ticket: Ticket, a: StagedAttachment): boolean {
  const name = safeFileName(a.filename, a.ext)
  if (ticket.attachments.some((x) => x.file === name)) return false
  renameSync(a.staged, join(ticketFolder(ticket.id), name))
  ticket.attachments.push({ filename: a.filename, mimeType: a.mimeType, file: name, size: a.size })
  return true
}

export function clearStaging() {
  rmSync(join(ticketsDir(), '.incoming'), { recursive: true, force: true })
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif'])

/**
 * Saves a barcode image the email loads from the web, when it doesn't print the code itself.
 * Fetched once, without cookies, so the card works offline at the door and never loads remote content.
 */
export async function saveBarcodeImage(ticket: Ticket, url: string, index: number): Promise<string | null> {
  const safe = safeHttpsUrl(url)
  if (!safe) return null
  try {
    const res = await fetch(safe, { redirect: 'follow', credentials: 'omit', signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 1024 * 1024) return null
    const type = sniffTicketFile(buf.subarray(0, 8))
    if (!type || !IMAGE_TYPES.has(type.mimeType)) return null
    const name = `barcode-${index + 1}.${type.ext}`
    writeFileSync(join(ticketFolder(ticket.id), name), buf)
    return name
  } catch {
    return null
  }
}

/** Absolute path of one of a ticket's own files; throws for anything not listed on the ticket. */
export function ticketFilePath(ticket: Ticket, file: string): string {
  const known = ticket.attachments.some((a) => a.file === file) || ticket.entries.some((e) => e.barcodeImage === file)
  if (!known) throw new Error('Unknown ticket file')
  const p = join(ticketFolder(ticket.id), file)
  if (!isInside(ticketsDir(), p) || !existsSync(p)) throw new Error('Ticket file is missing')
  return p
}

export function imageDataUrl(ticket: Ticket, file: string): string {
  const p = ticketFilePath(ticket, file)
  const type = sniffTicketFile(readHead(p))
  if (!type || !IMAGE_TYPES.has(type.mimeType)) throw new Error('Not an image')
  return `data:${type.mimeType};base64,${readFileSync(p).toString('base64')}`
}

export function removeTicketFiles(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return
  rmSync(join(ticketsDir(), id), { recursive: true, force: true })
}
