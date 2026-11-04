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
