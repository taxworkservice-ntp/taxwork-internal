/**
 * Detect embedded (in-app) browsers so client-facing share pages can warn that
 * file downloads are unreliable inside them and point users at a real browser.
 *
 * Kept pure — the UA string is passed in rather than read from `window` — so it
 * stays unit-testable and safe to import from client components.
 */

export type InAppBrowser =
  | "line"
  | "facebook"
  | "messenger"
  | "instagram"
  | "android-webview";

/** Human label for the detected in-app browser, used in the notice copy. */
export const IN_APP_BROWSER_LABELS: Record<InAppBrowser, string> = {
  line: "LINE",
  facebook: "Facebook",
  messenger: "Messenger",
  instagram: "Instagram",
  "android-webview": "แอปนี้",
};

/**
 * Identify a known in-app browser from a user-agent string. Branded webviews
 * are checked before the generic Android WebView signature.
 */
export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  const ua = userAgent || "";
  if (/\bLine\//i.test(ua) || /\bLIFF\//i.test(ua)) return "line";
  if (/\bMessenger|\bFB_IAB\b/i.test(ua)) return "messenger";
  if (/\bFBAN\b|\bFBAV\b/i.test(ua)) return "facebook";
  if (/\bInstagram\b/i.test(ua)) return "instagram";
  // Android WebView: the "; wv)" token, or the "Version/x.x Chrome/... Mobile
  // Safari" signature that stock Chrome Android does not carry.
  if (/;\s*wv\)/i.test(ua)) return "android-webview";
  if (/Version\/\d+\.\d+ Chrome\/[\d.]+ Mobile Safari/i.test(ua))
    return "android-webview";
  return null;
}

/** Whether the UA looks like an iOS device (iPhone/iPad/iPod, incl. iPadOS). */
export function detectIOS(userAgent: string): boolean {
  const ua = userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as desktop Safari but with "Mobile".
  return /Macintosh/i.test(ua) && /Mobile/i.test(ua);
}

/** What the tax-ID gate should do when a share link is opened in a webview. */
export type BrowserRedirectDecision = "auto" | "manual";

/**
 * Decide how the gate reacts to a user agent:
 * - `null`     — a real browser; nothing to do.
 * - `"auto"`   — Android webview; jump straight to Chrome via an intent.
 * - `"manual"` — iOS webview (which cannot auto-open Safari) or a webview whose
 *   auto attempt already failed; show a tap/copy fallback instead.
 */
export function browserRedirectDecision(
  userAgent: string,
  alreadyAttempted: boolean
): BrowserRedirectDecision | null {
  if (!detectInAppBrowser(userAgent)) return null;
  if (detectIOS(userAgent) || alreadyAttempted) return "manual";
  return "auto";
}

/**
 * Build an Android intent URL that re-opens `targetUrl` in Chrome, falling back
 * to the browser otherwise. Used by the "เปิดในเบราว์เซอร์" button inside an
 * Android in-app browser.
 */
export function chromeIntentUrl(targetUrl: string): string {
  const url = new URL(targetUrl);
  const scheme = url.protocol.replace(":", "") || "https";
  const path = `${url.host}${url.pathname}${url.search}${url.hash}`;
  const fallback = encodeURIComponent(targetUrl);
  return `intent://${path}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}
