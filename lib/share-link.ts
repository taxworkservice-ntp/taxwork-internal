/**
 * Share-link helpers shared by the server actions and the report model.
 * Kept in a plain module (not a "use server" file) so it can be imported
 * anywhere.
 */

const SHORT_EN_MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * Short, human-readable URL slug: "tax-report-aug-2026" (+ "-round-2" for
 * rounds after the first). ASCII-only so it never gets percent-encoded.
 * Decorative only — the random token is the key.
 */
export function shareSlug(periodLabel: string, seq: number): string {
  const [y, m] = periodLabel.split("-").map(Number);
  let slug = "tax-report";
  if (y && m >= 1 && m <= 12) {
    slug += `-${SHORT_EN_MONTHS[m - 1]}-${y}`;
  }
  if (seq > 1) slug += `-round-${seq}`;
  return slug.replace(/[^a-z0-9-]+/gi, "").slice(0, 48);
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
  // Random tokens are 20-char Crockford base32 (no dashes).
  const match = value.match(/[0-9A-Z]{20}$/);
  if (match) return match[0];
  return value;
}
