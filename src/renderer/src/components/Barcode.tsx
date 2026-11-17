import { useEffect, useRef, useState } from 'react'
import { toCanvas } from 'bwip-js/browser'
import type { BarcodeFormat, Ticket, TicketEntry } from '@shared/types'
import { cn } from '@/lib/utils'

const TWO_D: BarcodeFormat[] = ['qrcode', 'aztec', 'datamatrix']

/**
 * Draws a ticket's code on this machine from the value printed in the email, so nothing is
 * loaded from the web. Always black on white, including in dark mode, so door scanners can read it.
 */
export function Barcode({
  value,
  format,
  width,
  className,
}: {
  value: string
  format: BarcodeFormat
  /** Display width in CSS pixels; the canvas is drawn larger so it stays sharp when enlarged or printed. */
  width: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const square = TWO_D.includes(format)

  useEffect(() => {
    if (!ref.current) return
    try {
      toCanvas(ref.current, {
        bcid: format,
        text: value,
        scale: 6,
        padding: square ? 2 : 4,
        backgroundcolor: 'FFFFFF',
        barcolor: '000000',
        ...(square ? {} : { height: 14 }),
      })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [value, format, square])

  if (failed) {
    return (
      <p className={cn('rounded-md bg-white p-2 text-center text-[12px] text-black', className)} style={{ width }}>
        This code can’t be drawn. Show the email instead.
      </p>
    )
  }
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Ticket code ${value}`}
      className={cn('rounded-sm bg-white [image-rendering:pixelated]', className)}
      style={{ width, height: 'auto' }}
    />
  )
}

/** A data: URL for one of a ticket's own image files, read through the main process. */
export function useTicketImage(ticketId: string, file: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (file) {
      window.bills
        .ticketImage(ticketId, file)
        .then((u) => live && setUrl(u))
        .catch(() => live && setUrl(null))
    }
    return () => {
      live = false
    }
  }, [ticketId, file])
  return url
}

/** The code for one entry: drawn from its value, or the image saved from the email. */
export function EntryCode({ ticket, entry, width, className }: { ticket: Ticket; entry: TicketEntry; width: number; className?: string }) {
  const image = useTicketImage(ticket.id, entry.barcodeValue ? null : entry.barcodeImage)
  if (entry.barcodeValue) {
    return <Barcode value={entry.barcodeValue} format={entry.barcodeFormat ?? 'qrcode'} width={width} className={className} />
  }
  if (image) return <img src={image} alt="Ticket code" className={cn('rounded-sm bg-white', className)} style={{ width }} />
  return null
}

export function hasCode(e: TicketEntry): boolean {
  return Boolean(e.barcodeValue || e.barcodeImage)
}
