import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signing + helpers for the client tax-ID gate on public share links.
 *
 * The share token itself is a strong random secret, but it lives in the URL and
 * can be forwarded. To blunt casual/careless exposure we require the client to
 * prove knowledge of their tax ID once; that result is carried in a signed,
 * httpOnly cookie so the report HTML, PDF download, and slip endpoints all
 * trust it without re-prompting. Kept free of `next/headers` so it stays unit
 * testable — callers read/write the cookie.
 */

export const SHARE_ACCESS_COOKIE_PREFIX = "share_access_";

/** Signing key. Prefer a dedicated secret, fall back to the auth secret. */
function signingSecret(): string {
  const dedicated = process.env.SHARE_ACCESS_SECRET?.trim();
  if (dedicated) return dedicated;
  const auth = process.env.BETTER_AUTH_SECRET?.trim();
  if (auth) return auth;
  // better-auth requires BETTER_AUTH_SECRET in production; this fallback only
  // applies to local/dev where no secret is configured.
  return "taxwork-dev-share-access-secret";
}

/** Digits only (strips spaces, dashes, parentheses). */
export function normalizeTaxId(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

/** Thai tax IDs are 13 digits. */
export function isValidTaxId(value: string | null | undefined): boolean {
  return normalizeTaxId(value).length === 13;
}

/** Per-link cookie name so multiple reports can be unlocked independently. */
export function shareAccessCookieName(tokenKey: string): string {
  return `${SHARE_ACCESS_COOKIE_PREFIX}${tokenKey}`;
}

/** Unforgeable proof that the tax-ID check passed for this share link. */
export function signShareAccess(tokenKey: string): string {
  return createHmac("sha256", signingSecret())
    .update(`share-access:${tokenKey}`)
    .digest("base64url");
}

/** Constant-time comparison of a candidate cookie value. */
export function verifyShareAccess(
  candidate: string | null | undefined,
  tokenKey: string
): boolean {
  if (!candidate) return false;
  const expected = signShareAccess(tokenKey);
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Cookie attributes for the access proof. */
export function shareAccessCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/r",
    maxAge: maxAgeSeconds,
  };
}
