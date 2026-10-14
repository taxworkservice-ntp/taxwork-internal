# Agent Prompt — "Open in External Browser" (In-App Browser / WebView Escape)

You are implementing a feature for a web app. **Goal:** when a user opens one of
our links inside an **in-app browser (webview)** — LINE, Facebook, Messenger,
Instagram, etc. — detect it and get them into a **real browser** (Chrome on
Android, Safari on iOS) before they hit anything that requires a reliable
download or login. In-app webviews routinely break file downloads (they preview,
open a blank tab, or do nothing) and keep separate cookie stores.

This document is self-contained. Implement it faithfully; where you deviate,
explain why.

---

## 1. Terminology (so you search for the right things)

- Umbrella: **webview escape** / "open in external/system browser".
- Detection: **in-app browser detection** / **webview user-agent sniffing**.
- The Android jump: **Android Intent URI scheme** / **Chrome intent URL**
  (`intent://…#Intent;…;end`), documented by Chrome as *"Android Intents with
  Chrome."*
- The trigger: **deeplink** / custom-scheme navigation.

Searchable keywords: `Android Intent URI`, `Chrome intent scheme
browser_fallback_url`, `in-app browser detection user agent`, `webview escape
open external browser`, `LINE in-app browser UA`, `FBAN FBAV user agent`.

---

## 2. Platform capabilities — be honest about limits

| Platform | Can we auto-open the external browser? |
|---|---|
| Android (LINE/FB/IG webview) | **Usually yes** — navigate to an `intent://` URL targeting Chrome. Not 100% guaranteed (some webviews require a user gesture), so always keep a tap fallback. |
| iOS (LINE/FB/IG webview) | **No.** Apple blocks programmatically opening Safari from a webview. You can only instruct the user ("tap ⋯ → Open in Safari") and/or provide a copy-link button. Schemes like `googlechrome://` / `firefox://` only open those apps if installed (never Safari) and are unreliable; `x-safari-https://` is an undocumented hack — do not rely on it. |
| Real browser (already in Chrome/Safari) | Nothing to do. |

**Design consequence:** *auto on Android, instruct + copy-link on iOS.* Do not
promise a message-free experience on iOS — it is impossible.

---

## 3. Where to trigger it (critical)

Trigger the redirect **as early as possible — before any login / token / form
step.** Reason: **the webview and the real browser have separate cookie stores.**
If you authenticate inside the webview then bounce out, the session is lost and
the user must do it again. Redirecting at the *entry* screen avoids this.

---

## 4. Required behavior

1. On the entry screen's mount (client-side only), read `navigator.userAgent`.
2. If it is **not** an in-app browser → render the normal UI, do nothing.
3. If it **is** an in-app browser:
   - **Android:** attempt `window.location.replace(intentUrl)` immediately.
     - Show a brief "opening browser…" spinner.
     - Because the attempt can be silently blocked, after a short timeout
       (~1500 ms) reveal a **tap fallback button** pointing at the same intent URL.
   - **iOS:** do not attempt an auto-jump. Show a clear action screen:
     - instruction: "tap ⋯ top-right → Open in Safari";
     - a **Copy link** button (so they can paste into Safari).
4. **Loop guard:** set a one-shot flag (e.g. `sessionStorage["open-in-browser:<id>"] = "1"`)
   *before* navigating to the intent. On any subsequent load, if the flag is set,
   skip the auto attempt and show the tap fallback instead. This prevents a
   blocked intent that falls back to the same webview from looping forever.
5. Do not render the underlying form while an auto-redirect is in flight.

---

## 5. User-agent detection patterns

Match case-insensitively. Check branded webviews **before** generic ones.

| Webview | Pattern |
|---|---|
| LINE | `/\bLine\//i` or `/\bLIFF\//i` |
| Messenger | `/\bMessenger|\bFB_IAB\b/i` |
| Facebook | `/\bFBAN\b|\bFBAV\b/i` |
| Instagram | `/\bInstagram\b/i` |
| Generic Android WebView | `/;\s*wv\)/i` **or** `/Version\/\d+\.\d+ Chrome\/[\d.]+ Mobile Safari/i` |
| iOS device | `/iPhone|iPad|iPod/i` **or** (`/Macintosh/i` **and** `/Mobile/i`) — the second covers iPadOS reporting as desktop Safari |

Notes:
- Match `Messenger` **without** a trailing word boundary — real UAs contain
  `MessengerForiOS`.
- Stock Chrome on Android has **no** `Version/` token; that token (plus
  `Chrome/… Mobile Safari`) is what distinguishes a WebView. Do not flag it.
- Desktop and normal mobile browsers must return **no** match.

---

## 6. Android Intent URL syntax

```
intent://<host><path>?<query>#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=<url-encoded original absolute URL>;end
```

Rules:
- Take `<host><path><query><hash>` from the current page URL (strip the
  `https://`).
- `scheme=https` (or the URL's actual scheme).
- `package=com.android.chrome` targets Chrome. Swap the package to target
  another browser, or **omit `package=`** to let Android show a chooser / open
  the system default browser.
- `S.browser_fallback_url=<encodeURIComponent(fullUrl)>` is where Android goes if
  the target app isn't installed. Always include it to avoid a dead end.
- The value of `browser_fallback_url` must be **URL-encoded**.

Example:
```
https://ex.com/r/abc?x=1
→
intent://ex.com/r/abc?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fex.com%2Fr%2Fabc%3Fx%3D1;end
```

---

## 7. Reference implementation (pseudo-code)

Pure, unit-testable helpers (no `window` access — pass the UA string in):

```ts
type InAppBrowser = "line" | "facebook" | "messenger" | "instagram" | "android-webview";

function detectInAppBrowser(ua: string): InAppBrowser | null { /* table from §5 */ }
function detectIOS(ua: string): boolean { /* iOS patterns from §5 */ }

function chromeIntentUrl(targetUrl: string): string {
  const url = new URL(targetUrl);
  const scheme = url.protocol.replace(":", "") || "https";
  const path = `${url.host}${url.pathname}${url.search}${url.hash}`;
  const fallback = encodeURIComponent(targetUrl);
  return `intent://${path}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

type Decision = "auto" | "manual";
function browserRedirectDecision(ua: string, alreadyAttempted: boolean): Decision | null {
  if (!detectInAppBrowser(ua)) return null;          // real browser → do nothing
  if (detectIOS(ua) || alreadyAttempted) return "manual";
  return "auto";                                      // Android → try intent
}
```

Component (React shown; adapt to your framework). Run only on the client, in an
effect after mount:

```tsx
useEffect(() => {
  const ua = navigator.userAgent || "";
  const here = window.location.href;
  const kind = detectInAppBrowser(ua);
  if (!kind) return;                       // normal browser

  const guardKey = `open-in-browser:${urlId}`;
  const attempted = sessionStorage.getItem(guardKey) === "1";

  if (browserRedirectDecision(ua, attempted) !== "auto") {
    setShowManualScreen(true);             // iOS or already-tried
    return;
  }
  sessionStorage.setItem(guardKey, "1");
  setRedirecting(true);
  window.location.replace(chromeIntentUrl(here));

  const t = setTimeout(() => {             // blocked? show tap fallback
    setRedirecting(false);
    setShowManualScreen(true);
  }, 1500);
  return () => clearTimeout(t);
}, [urlId]);
```

Render:
- `redirecting` → spinner "opening browser…".
- iOS manual screen → instructions + **Copy link** button
  (`navigator.clipboard.writeText(here)`).
- Android manual screen → `<a href={chromeIntentUrl(here)}>` "Open in browser"
  plus "or tap ⋮ → Open in Chrome".

---

## 8. Robustness checklist

- [ ] Detection is client-only (US the effect/`useEffect`); server render must
      not differ from the first client render (avoid hydration mismatches).
- [ ] Pure helpers take the UA as a parameter and are **unit tested** (desktop,
      Android Chrome, iOS Safari, LINE Android, LINE iOS, FB, IG, Android
      WebView, empty string, and the retry case).
- [ ] One-shot `sessionStorage` guard prevents redirect loops.
- [ ] Timeout reveals a tap fallback when the Android intent is blocked
      (also covers `sessionStorage` being unavailable in private mode — wrap in
      try/catch).
- [ ] Redirect fires **before** login/token steps (cookie-store isolation).
- [ ] iOS always gets a usable path (instructions + copy link) — never a dead end.
- [ ] `browser_fallback_url` is URL-encoded.
- [ ] The underlying form is not shown/interactive while redirecting.

---

## 9. Testing matrix

| Environment | Expected |
|---|---|
| Desktop Chrome/Edge/Firefox | Normal UI, no redirect. |
| Android Chrome | Normal UI, no redirect. |
| iOS Safari | Normal UI, no redirect. |
| LINE Android | Auto-bounce to Chrome; on failure, tap button appears. |
| LINE iOS | Tap/copy screen (no auto-bounce). |
| Facebook / Instagram webview | Same as LINE for the matching OS. |
| Returning webview visit (guard flag set) | Tap fallback immediately, no loop. |

---

## 10. Concrete reference in this repo

If you want a working example, mirror these files:

- `lib/in-app-browser.ts` — UA detection, `chromeIntentUrl`, `browserRedirectDecision`.
- `app/r/[token]/share-gate.tsx` — the gate component that runs the redirect
  effect and renders the manual screens.
- `tests/unit/in-app-browser.test.ts` — the detection/decision tests to copy.
