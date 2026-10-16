/**
 * Thai Tax ID / juristic registration number (13 digits) helpers.
 * Pure — safe on client and server.
 */

/** Digits only (strips spaces, dashes, parentheses). */
export function taxIdDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Format 13 digits as 0-0000-00000-00-0; returns the trimmed input otherwise. */
export function formatTaxId(raw: string | null | undefined): string {
  const d = taxIdDigits(raw);
  if (d.length !== 13) return (raw ?? "").trim();
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
}

export type TaxIdCheck = { digits: string; ok: boolean; reason: string };

/** MOD-11 checksum validation (last digit). */
export function checkTaxId(raw: string | null | undefined): TaxIdCheck {
  const digits = taxIdDigits(raw);
  if (digits.length !== 13) return { digits, ok: false, reason: "ต้องมี 13 หลัก" };
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i], 10) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  if (check !== parseInt(digits[12], 10)) return { digits, ok: false, reason: "checksum ไม่ผ่าน" };
  return { digits, ok: true, reason: "" };
}

export function isValidTaxId(raw: string | null | undefined): boolean {
  return checkTaxId(raw).ok;
}
