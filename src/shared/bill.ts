import type { Bill } from './types'

/** A zero or credit statement: worth seeing so you know the bill came, but nothing to pay. */
export function isNothingToPay(b: Pick<Bill, 'amount'>): boolean {
  return b.amount != null && b.amount <= 0
}

/**
 * Opens the bill's own email. The connector's viewUrl ("#all/thread-f:…|msg-f:…") lands on the
 * inbox once the "|" is escaped on the way to the browser, so link by the Gmail message id instead.
 * The account goes in ?authuser=: Gmail redirects that to the right /u/N/ slot, whereas an email
 * address in the /u/ path itself fails with "Temporary Error (404)".
 */
export function gmailEmailUrl(b: Pick<Bill, 'gmailMessageIds' | 'gmailViewUrl'>): string | null {
  const id = b.gmailMessageIds[0]
  if (!id || !/^[0-9a-f]+$/i.test(id)) return b.gmailViewUrl
  let authuser: string | null = null
  try {
    authuser = b.gmailViewUrl ? new URL(b.gmailViewUrl).searchParams.get('authuser') : null
  } catch {
    // Malformed viewUrl: the first signed-in account is the best guess.
  }
  if (authuser && /^[^/?#\s]+$/.test(authuser)) {
    return `https://mail.google.com/mail/?authuser=${encodeURIComponent(authuser).replace(/%40/g, '@')}#all/${id}`
  }
  return `https://mail.google.com/mail/u/0/#all/${id}`
}

/** Payment links come from email content, so only plain https links without embedded credentials are kept. */
export function safePaymentUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:' || u.username || u.password || u.href.length > 2048) return null
    return u.href
  } catch {
    return null
  }
}
