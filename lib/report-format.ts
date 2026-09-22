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
