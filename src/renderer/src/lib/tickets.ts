import type { Ticket, TicketKind } from '@shared/types'
import { daysUntilStart, isPastTicket, parseLocal } from '@shared/ticket'

export { isPastTicket }

export type TicketGroupId = 'tickets-upcoming' | 'tickets-past'

export const TICKET_GROUPS: Array<{ id: TicketGroupId; label: string; hint: string }> = [
  { id: 'tickets-upcoming', label: 'Upcoming', hint: 'Theater, cinema, events and hotel stays still ahead' },
  { id: 'tickets-past', label: 'Past', hint: 'Tickets and bookings that are over' },
]

export function isTicketGroup(g: string): g is TicketGroupId {
  return g === 'tickets-upcoming' || g === 'tickets-past'
}

export function inTicketGroup(t: Ticket, g: TicketGroupId, now = new Date()): boolean {
  return isPastTicket(t, now) === (g === 'tickets-past')
}

export type TicketWhen = 'today' | 'week' | 'later' | 'undated'

export const TICKET_WHEN_LABEL: Record<TicketWhen, string> = {
  today: 'Today and tomorrow',
  week: 'Within 7 days',
  later: 'Later',
  undated: 'No date found',
}

export function ticketWhen(t: Ticket, now = new Date()): TicketWhen {
  const n = daysUntilStart(t, now)
  if (n == null) return 'undated'
  if (n <= 1) return 'today'
  if (n <= 7) return 'week'
  return 'later'
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const dayYearFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

function day(d: Date): string {
  return (d.getFullYear() === new Date().getFullYear() ? dayFmt : dayYearFmt).format(d)
}

function time(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "Sat 5 Dec" and "18:00" for the card's big date; time is null for date-only bookings. */
export function ticketDate(when: string | null): { day: string; time: string | null } | null {
  const p = parseLocal(when)
  return p ? { day: day(p.date), time: p.hasTime ? time(p.date) : null } : null
}

export function countdown(t: Ticket, now = new Date()): string | null {
  if (t.cancelled) return 'Cancelled'
  if (isPastTicket(t, now)) return null
  const n = daysUntilStart(t, now)
  if (n == null) return null
  if (n < 0) return t.kind === 'hotel' ? 'Staying now' : 'Started'
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return `In ${n} days`
}

export const KIND_LABEL: Record<TicketKind, string> = {
  theater: 'Theater',
  cinema: 'Cinema',
  event: 'Event',
  hotel: 'Hotel',
  other: 'Booking',
}

/**
 * The site a link really goes to. Email links are often wrapped in a click tracker
 * ("…awstrack.me/L0/https:%2F%2Fwww.example.com…"), so show the wrapped address's host when there is one.
 */
export function hostOf(url: string | null): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    const inner = /https?(?::|%3A)(?:\/|%2F){2}([^/%?#]+)/i.exec(u.pathname + u.search)
    return (inner ? inner[1] : u.hostname).replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}
