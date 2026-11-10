/** ISO 11649 mod-97 check used by RF references; flags a code that was misread from an email. */
export function isValidRf(rf: string): boolean {
  const c = rf.replace(/\s/g, '').toUpperCase()
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(c)) return false
  const rearranged = c.slice(4) + c.slice(0, 4)
  const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))
  let rem = 0
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97
  return rem === 1
}

/** Only codes that look like RF references can be checked; other payment codes are left alone. */
export function looksLikeRf(code: string): boolean {
  return /^RF/i.test(code.replace(/\s/g, ''))
}

export interface PaymentCodes {
  rfCode: string | null
  paymentCode: string | null
}

/** Keeps an email's RF reference and the vendor's own payment code in their own fields. */
export function splitPaymentCodes(rfCode: string | null | undefined, paymentCode: string | null | undefined): PaymentCodes {
  const rf = rfCode?.trim() || null
  const pay = paymentCode?.trim() || null
  const vendorCodeInRfField = rf != null && !looksLikeRf(rf)
  const rfInPaymentField = pay != null && looksLikeRf(pay)
  const swap = (vendorCodeInRfField && (pay == null || rfInPaymentField)) || (rf == null && rfInPaymentField)
  const codes = swap ? { rfCode: pay, paymentCode: rf } : { rfCode: rf, paymentCode: pay }
  // The same code reported in both fields: keep it once, in the field its shape belongs to.
  if (codes.rfCode && codes.paymentCode && compact(codes.rfCode) === compact(codes.paymentCode)) {
    return looksLikeRf(codes.rfCode) ? { ...codes, paymentCode: null } : { ...codes, rfCode: null }
  }
  return codes
}

function compact(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}
