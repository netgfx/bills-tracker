import { powerMonitor } from 'electron'
import { db } from './db.ts'
import { notify } from './notify.ts'
import { dueReminder } from '../shared/ticket.ts'

const EVERY_MS = 15 * 60_000

/** Shows each ticket's day-before reminder once, checking every 15 minutes and after the computer wakes. */
export function startReminders(onChange: () => void) {
  const check = () => {
    if (!db.settings().ticketReminders) return
    const now = new Date()
    let changed = false
    for (const t of db.tickets()) {
      const r = dueReminder(t, now)
      if (!r) continue
      notify(r.title, r.body)
      t.remindedAt = now.toISOString()
      db.upsertTicket(t)
      changed = true
    }
    if (changed) onChange()
  }
  setTimeout(check, 10_000)
  setInterval(check, EVERY_MS)
  powerMonitor.on('resume', () => setTimeout(check, 30_000))
}
