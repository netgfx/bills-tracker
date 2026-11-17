import { useState } from 'react'
import { toast } from 'sonner'
import {
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Drama,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Mail,
  MapPin,
  MoreHorizontal,
  Printer,
  Ticket as TicketIcon,
  Trash2,
  Wallet,
} from 'lucide-react'
import type { Ticket, TicketKind } from '@shared/types'
import { gmailEmailUrl } from '@shared/bill'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EntryCode, hasCode } from '@/components/Barcode'
import { formatAmount } from '@/lib/bills'
import { KIND_LABEL, countdown, hostOf, isPastTicket, ticketDate } from '@/lib/tickets'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

const KIND: Record<TicketKind, { icon: typeof TicketIcon; color: string }> = {
  theater: { icon: Drama, color: 'var(--cat-phone)' },
  cinema: { icon: Clapperboard, color: 'var(--cat-gas)' },
  event: { icon: TicketIcon, color: 'var(--cat-electricity)' },
  hotel: { icon: BedDouble, color: 'var(--cat-auto)' },
  other: { icon: TicketIcon, color: 'var(--cat-other)' },
}

const STUB_CODES = 4

function failed(what: string) {
  return () => toast.error(`Couldn’t open ${what}`)
}

export function TicketCard({ ticket: t }: { ticket: Ticket }) {
  const { removeTicket, printTicket } = useApp()
  const platform = useApp((s) => s.snapshot?.platform)
  const [copied, setCopied] = useState(false)
  const [enlarged, setEnlarged] = useState<number | null>(null)
  const kind = KIND[t.kind]
  const Icon = kind.icon
  const start = ticketDate(t.startsAt)
  const end = ticketDate(t.endsAt)
  const left = countdown(t)
  const past = isPastTicket(t)
  const emailUrl = gmailEmailUrl(t)
  const coded = t.entries.map((e, i) => ({ e, i })).filter(({ e }) => hasCode(e))
  const seats = t.entries.map((e) => e.seat).filter(Boolean) as string[]
  const hotel = t.kind === 'hotel'

  async function copyRef() {
    await window.bills.copyText(t.bookingReference!)
    setCopied(true)
    toast.success('Booking reference copied', { description: t.bookingReference!, duration: 1800 })
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <article
      aria-label={`${t.title}${start ? `, ${start.day}${start.time ? ` at ${start.time}` : ''}` : ''}`}
      className={cn('relative grid grid-cols-[1fr_17rem] rounded-lg border border-rule bg-slip', (past || t.cancelled) && 'opacity-80')}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-l-lg" style={{ background: kind.color }} />

      <div className="flex min-w-0 flex-col gap-3 py-4 pl-5 pr-4">
        <header className="flex items-start gap-3">
          <span
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md"
            style={{ background: `color-mix(in oklab, ${kind.color} 16%, transparent)`, color: kind.color }}
            title={KIND_LABEL[t.kind]}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-tight" title={t.title}>
              {t.title}
            </h3>
            <p className="truncate text-[13px] text-ink-muted">
              {[t.venue, t.vendor !== t.venue ? t.vendor : null].filter(Boolean).join(' · ') || KIND_LABEL[t.kind]}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-2 -mt-1 text-ink-muted" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {emailUrl && (
                <DropdownMenuItem onSelect={() => void window.bills.openExternal(emailUrl)}>
                  <Mail /> Open email in Gmail
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => printTicket(t)}>
                <Printer /> Print
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  await removeTicket(t.id)
                  toast(`Removed ${t.title}`, { description: 'It won’t come back on the next check.' })
                }}
              >
                <Trash2 /> Not a ticket, remove it
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="flex items-end justify-between gap-4">
          {start ? (
            <div className="leading-none">
              <p className="text-[13px] text-ink-muted">{hotel ? 'Check-in' : start.time ? 'Starts' : 'Date'}</p>
              <p className="mt-1 text-[24px] font-semibold tracking-tight">
                {start.day}
                {start.time && <span className="ml-2 text-ink-muted">{start.time}</span>}
              </p>
              {hotel && end && (
                <p className="mt-1.5 text-[13px] text-ink-muted">
                  Check-out {end.day}
                  {end.time ? ` ${end.time}` : ''}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xl font-medium text-ink-muted">Date not found</p>
          )}
          {left && (
            <p
              className={cn(
                'rounded px-1.5 text-[13px] font-semibold',
                t.cancelled ? 'bg-overdue-wash text-overdue' : left === 'Today' || left === 'Tomorrow' ? 'bg-soon-wash text-soon' : 'text-later',
              )}
            >
              {left}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          {t.quantity != null && (
            <span>
              {t.quantity} {hotel ? (t.quantity === 1 ? 'guest' : 'guests') : t.quantity === 1 ? 'ticket' : 'tickets'}
            </span>
          )}
          {seats.length > 0 && (
            <span className="min-w-0 truncate text-ink-muted" title={seats.join('; ')}>
              {seats.join('; ')}
            </span>
          )}
          {t.totalAmount != null && <span className="text-ink-muted">{formatAmount({ amount: t.totalAmount, currency: t.currency })}</span>}
        </div>

        {(t.bookingReference || t.address || emailUrl) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            {t.bookingReference && (
              <button
                type="button"
                onClick={() => void copyRef()}
                title="Copy booking reference"
                className="group/detail -ml-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="text-ink-muted">Booking</span>
                <span className="rf-code truncate font-semibold">{t.bookingReference}</span>
                {copied ? (
                  <Check className="size-3.5 shrink-0 text-stamp" />
                ) : (
                  <Copy className="size-3.5 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover/detail:opacity-100" />
                )}
              </button>
            )}
            {t.address && (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-muted" title={t.address}>
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{t.address}</span>
              </span>
            )}
            {emailUrl && (
              <button
                type="button"
                onClick={() => void window.bills.openExternal(emailUrl)}
                className="-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-ink-muted transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Mail className="size-3.5" /> View email
              </button>
            )}
          </div>
        )}

        {t.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {t.attachments.map((a, i) => {
              const FileIcon = a.mimeType.startsWith('image/') ? ImageIcon : a.mimeType === 'application/pdf' ? FileText : Wallet
              const openable = a.mimeType !== 'application/vnd.apple.pkpass' || platform === 'darwin'
              return (
                <Tooltip key={a.file}>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!openable}
                      className="max-w-full"
                      onClick={() => void window.bills.openTicketAttachment(t.id, i).catch(failed(a.filename))}
                    >
                      <FileIcon />
                      <span className="truncate">{a.filename}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {openable ? 'Opens in your PDF or image viewer, where you can print it' : 'Wallet passes open on a Mac or phone'}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        )}

        {t.notes && <p className="text-[13px] leading-snug text-ink-muted">{t.notes}</p>}
      </div>

      {/* The stub: what you show at the door. */}
      <div className="perforation flex flex-col justify-between gap-3 py-4 pl-5 pr-4">
        {coded.length > 0 ? (
          <div>
            <div className={cn('grid gap-2', coded.length > 1 ? 'grid-cols-2' : 'grid-cols-1 justify-items-start')}>
              {coded.slice(0, STUB_CODES).map(({ e, i }) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setEnlarged(i)}
                  title="Show larger for scanning"
                  className="flex flex-col items-center gap-1 rounded-md p-1 transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <EntryCode ticket={t} entry={e} width={coded.length > 1 ? 96 : 128} />
                  {e.seat && <span className="max-w-full truncate text-[11px] text-ink-muted">{e.seat}</span>}
                </button>
              ))}
            </div>
            {coded.length > STUB_CODES && (
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => setEnlarged(coded[STUB_CODES].i)}>
                +{coded.length - STUB_CODES} more
              </Button>
            )}
            <p className="mt-2 text-[11px] leading-snug text-ink-muted">Made from the code in the email. If it won’t scan, show the email.</p>
          </div>
        ) : (
          <div>
            <p className="mb-1 text-[12px] text-ink-muted">Ticket code</p>
            <p className="text-[13px] text-ink-muted">
              {t.attachments.length
                ? 'In the attached file.'
                : t.ticketsUrl || t.appleWalletUrl || t.googleWalletUrl
                  ? 'Not in the email. Open your tickets below.'
                  : hotel
                    ? 'Not needed. Show your booking reference.'
                    : 'Not in the email.'}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {t.ticketsUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" className="w-full" onClick={() => void window.bills.openTicketLink(t.id, 'tickets').catch(failed('the link'))}>
                  <ExternalLink /> {hotel ? 'Manage booking' : 'Open tickets'}
                  <span className="min-w-0 truncate font-normal text-ink-muted">{hostOf(t.ticketsUrl)}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-80 break-all">{t.ticketsUrl}</TooltipContent>
            </Tooltip>
          )}
          {(t.appleWalletUrl || t.googleWalletUrl) && (
            <div className="grid grid-cols-2 gap-2">
              {t.appleWalletUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-w-0"
                  title="Add to Apple Wallet"
                  onClick={() => void window.bills.openTicketLink(t.id, 'apple').catch(failed('the link'))}
                >
                  <Wallet /> <span className="truncate">Apple</span>
                </Button>
              )}
              {t.googleWalletUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-w-0"
                  title="Add to Google Wallet"
                  onClick={() => void window.bills.openTicketLink(t.id, 'google').catch(failed('the link'))}
                >
                  <Wallet /> <span className="truncate">Google</span>
                </Button>
              )}
            </div>
          )}
          <Button size="sm" variant="secondary" className="w-full" onClick={() => printTicket(t)}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      {t.cancelled && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/3 top-1/2 -translate-y-1/2 -rotate-8 rounded border-2 border-overdue px-2 py-0.5 text-[15px] font-bold tracking-wide text-overdue"
        >
          Cancelled
        </span>
      )}

      <CodeViewer ticket={t} index={enlarged} onIndex={setEnlarged} />
    </article>
  )
}

/** One code at a time, large and on white, for holding the screen up to a scanner. */
function CodeViewer({ ticket, index, onIndex }: { ticket: Ticket; index: number | null; onIndex: (i: number | null) => void }) {
  const coded = ticket.entries.map((e, i) => ({ e, i })).filter(({ e }) => hasCode(e))
  const pos = coded.findIndex((c) => c.i === index)
  const cur = pos >= 0 ? coded[pos] : null
  const step = (d: number) => onIndex(coded[(pos + d + coded.length) % coded.length].i)
  return (
    <Dialog open={cur != null} onOpenChange={(open) => !open && onIndex(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="truncate">{ticket.title}</DialogTitle>
        <DialogDescription>
          {coded.length > 1 ? `Ticket ${pos + 1} of ${coded.length}` : 'Your ticket'}
          {cur?.e.seat ? `, ${cur.e.seat}` : ''}
          {cur?.e.label ? ` (${cur.e.label})` : ''}
        </DialogDescription>
        {cur && (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-5">
            <EntryCode ticket={ticket} entry={cur.e} width={300} />
            {cur.e.barcodeValue && <p className="rf-code text-[15px] font-semibold text-black">{cur.e.barcodeValue}</p>}
          </div>
        )}
        {coded.length > 1 && (
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => step(-1)}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => step(1)}>
              Next <ChevronRight />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
