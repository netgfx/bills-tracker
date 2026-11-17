import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Ticket } from '@shared/types'
import { EntryCode, hasCode, useTicketImage } from '@/components/Barcode'
import { formatAmount } from '@/lib/bills'
import { KIND_LABEL, ticketDate } from '@/lib/tickets'
import { useApp } from '@/store/useApp'

/**
 * A plain black-on-white page for the ticket being printed. It only shows in print
 * (see `#print-sheet` in styles.css); the system print dialog opens once codes and images are drawn.
 */
export function PrintSheet() {
  const { printing, printTicket } = useApp()
  if (!printing) return null
  return createPortal(<Sheet ticket={printing} onDone={() => printTicket(null)} />, document.body)
}

function Sheet({ ticket: t, onDone }: { ticket: Ticket; onDone: () => void }) {
  const images = t.attachments.filter((a) => a.mimeType.startsWith('image/'))
  const [loaded, setLoaded] = useState(0)
  const ready = loaded >= images.length
  const printed = useRef(false)

  useEffect(() => {
    if (!ready || printed.current) return
    printed.current = true
    // Two frames so canvases have painted before the print snapshot is taken.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print()
        onDone()
      }),
    )
  }, [ready, onDone])

  const start = ticketDate(t.startsAt)
  const end = ticketDate(t.endsAt)
  const coded = t.entries.filter(hasCode)
  const pdfs = t.attachments.filter((a) => a.mimeType === 'application/pdf')

  return (
    <div id="print-sheet">
      <p className="ps-kind">{KIND_LABEL[t.kind]}</p>
      <h1>{t.title}</h1>
      <p className="ps-when">
        {start ? `${start.day}${start.time ? `, ${start.time}` : ''}` : 'Date not in the email'}
        {t.kind === 'hotel' && end ? ` to ${end.day}${end.time ? `, ${end.time}` : ''}` : ''}
      </p>
      {(t.venue || t.address) && <p>{[t.venue, t.address].filter(Boolean).join(', ')}</p>}
      <p className="ps-meta">
        {[
          t.bookingReference && `Booking ${t.bookingReference}`,
          t.quantity != null && `${t.quantity} ${t.kind === 'hotel' ? 'guests' : 'tickets'}`,
          t.totalAmount != null && formatAmount({ amount: t.totalAmount, currency: t.currency }),
          t.vendor,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {t.cancelled && <p className="ps-cancelled">This booking was cancelled.</p>}

      {coded.length > 0 && (
        <div className="ps-codes">
          {coded.map((e, i) => (
            <figure key={i}>
              <EntryCode ticket={t} entry={e} width={coded.length > 2 ? 150 : 200} />
              <figcaption>
                {[e.seat, e.label].filter(Boolean).join(' · ') || `Ticket ${i + 1}`}
                {e.barcodeValue && <span className="ps-value">{e.barcodeValue}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {images.map((a) => (
        <PrintImage key={a.file} ticket={t} file={a.file} onLoad={() => setLoaded((n) => n + 1)} />
      ))}

      {pdfs.length > 0 && (
        <p className="ps-note">
          The attached {pdfs.length === 1 ? 'ticket file' : 'ticket files'} ({pdfs.map((a) => a.filename).join(', ')}) print from their own
          viewer: open {pdfs.length === 1 ? 'it' : 'them'} from the ticket card.
        </p>
      )}
      <p className="ps-note">Printed from Bills Tracker. Codes are drawn from the values in the confirmation email.</p>
    </div>
  )
}

function PrintImage({ ticket, file, onLoad }: { ticket: Ticket; file: string; onLoad: () => void }) {
  const url = useTicketImage(ticket.id, file)
  const done = useRef(false)
  const onLoadRef = useRef(onLoad)
  onLoadRef.current = onLoad
  const finish = () => {
    if (done.current) return
    done.current = true
    onLoadRef.current()
  }
  useEffect(() => {
    // An image that can't be read shouldn't hold the print dialog back.
    const t = setTimeout(finish, 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!url) return null
  return <img src={url} alt="" className="ps-image" onLoad={finish} onError={finish} />
}
