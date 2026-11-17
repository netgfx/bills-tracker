import type { Ticket } from './types'

const WHEN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/

/** Parses the app's local "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" into a Date in this machine's time zone. */
export function parseLocal(when: string | null | undefined): { date: Date; hasTime: boolean } | null {
  const m = when ? WHEN.exec(when) : null
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), h ? Number(h) : 0, mi ? Number(mi) : 0)
  // Date rolls 30 February over into March; a date that doesn't exist is no date.
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d) || Number(h ?? 0) > 23 || Number(mi ?? 0) > 59) return null
  return { date, hasTime: h != null }
}

/** Shows that start at a time are over a few hours later; date-only bookings at the end of that day. */
const EVENT_LENGTH_MS = 4 * 3_600_000

/** When the ticket stops being useful: the end (check-out) if known, else a few hours after the start. */
export function ticketEnd(t: Pick<Ticket, 'startsAt' | 'endsAt'>): Date | null {
  const end = parseLocal(t.endsAt)
  if (end) return end.hasTime ? end.date : endOfDay(end.date)
  const start = parseLocal(t.startsAt)
  if (!start) return null
  return start.hasTime ? new Date(start.date.getTime() + EVENT_LENGTH_MS) : endOfDay(start.date)
}

function endOfDay(d: Date): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

/** Past once it has ended. Undated tickets stay upcoming until removed, so they are never lost. */
export function isPastTicket(t: Pick<Ticket, 'startsAt' | 'endsAt'>, now = new Date()): boolean {
  const end = ticketEnd(t)
  return end != null && end.getTime() < now.getTime()
}

/** Whole calendar days from today to the start; 0 is today, negative once started. */
export function daysUntilStart(t: Pick<Ticket, 'startsAt'>, now = new Date()): number | null {
  const start = parseLocal(t.startsAt)
  if (!start) return null
  const a = new Date(now)
  a.setHours(0, 0, 0, 0)
  const b = new Date(start.date)
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

const REMIND_BEFORE_MS = 24 * 3_600_000

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * The day-before reminder for a ticket, once it starts within 24 hours; null otherwise.
 * Date-only bookings (most hotel check-ins) count from 09:00 that day.
 */
export function dueReminder(
  t: Pick<Ticket, 'kind' | 'title' | 'venue' | 'startsAt' | 'cancelled' | 'remindedAt'>,
  now = new Date(),
): { title: string; body: string } | null {
  if (t.cancelled || t.remindedAt) return null
  const start = parseLocal(t.startsAt)
  if (!start) return null
  const at = start.hasTime ? start.date : new Date(start.date.getTime() + 9 * 3_600_000)
  const ms = at.getTime() - now.getTime()
  if (ms <= 0 || ms > REMIND_BEFORE_MS) return null
  const day = daysUntilStart(t, now) === 0 ? 'Today' : 'Tomorrow'
  if (t.kind === 'hotel') {
    return { title: `${day}: check-in at ${t.title}`, body: start.hasTime ? `From ${hhmm(start.date)}` : 'Your booking details are in Bills Tracker.' }
  }
  return {
    title: start.hasTime ? `${day} at ${hhmm(start.date)}: ${t.title}` : `${day}: ${t.title}`,
    body: t.venue ? `At ${t.venue}. Your tickets are in Bills Tracker.` : 'Your tickets are in Bills Tracker.',
  }
}

/** Upcoming first by start time; undated last. Past tickets sort most recent first. */
export function sortTickets(a: Ticket, b: Ticket, past = false): number {
  const sa = a.startsAt ?? ''
  const sb = b.startsAt ?? ''
  if (!sa && !sb) return (b.emailDate ?? '').localeCompare(a.emailDate ?? '')
  if (!sa) return 1
  if (!sb) return -1
  return past ? sb.localeCompare(sa) : sa.localeCompare(sb)
}
