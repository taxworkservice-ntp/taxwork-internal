/**
 * Share-link helpers shared by the server actions and the report model.
 * Kept in a plain module (not a "use server" file) so it can be imported
 * anywhere.
 */

const SHORT_THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * Short, human-readable URL slug: "รายงานภาษี-ส.ค.2569" (+ "-ครั้งที่2" for
 * rounds after the first). Decorative only — the random token is the key.
 */
export function shareSlug(periodLabel: string, seq: number): string {
  const [y, m] = periodLabel.split("-").map(Number);
  let slug = "รายงานภาษี";
  if (y && m >= 1 && m <= 12) {
    slug += `-${SHORT_THAI_MONTHS[m - 1]}${y + 543}`;
  }
  if (seq > 1) slug += `-ครั้งที่${seq}`;
  return slug.replace(/[/\\?#%]+/g, "").slice(0, 48);
}

export function shareUrl(origin: string, slug: string, token: string): string {
  // Single path segment "<slug>-<token>" (Next.js disallows sibling dynamic
  // segments). The token is the trailing segment; the slug is decorative.
  const seg = slug ? `${slug}-${token}` : token;
  return `${origin}/r/${encodeURIComponent(seg)}`;
}

/** Extract the random token from a (possibly slug-prefixed) share segment. */
export function shareTokenFromSegment(segment: string): string {
  const value = decodeURIComponent(segment);
  const lastDash = value.lastIndexOf("-");
  // Random tokens are base32 (no dashes); slug contains dashes.
  if (lastDash < 0) return value;
  const tail = value.slice(lastDash + 1);
  return /^[0-9A-Z]+$/.test(tail) ? tail : value;
}
