/**
 * Shared, environment-agnostic formatting helpers for report presentation
 * (share page metadata, Open Graph images). Keep this module free of
 * server-only imports so it can run in any rendering context.
 */

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** "2026-08" -> "สิงหาคม 2569" (falls back to the raw label). */
export function periodToThai(periodLabel: string): string {
  const [y, m] = periodLabel.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodLabel;
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

/** Amount with thousands separators and exactly two decimals. */
export function formatBaht(n: number): string {
  return Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Mask the local part of an email address for display: "somchai@example.com"
 * -> "so*****@example.com". The domain is kept so staff can still recognise
 * the recipient, while the full address is only shown when explicitly revealed.
 */
export function maskEmail(email: string): string {
  const value = email.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return value;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  const masked = "*".repeat(Math.max(3, local.length - visible.length));
  return `${visible}${masked}@${domain}`;
}
