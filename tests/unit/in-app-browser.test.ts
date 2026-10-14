import { describe, expect, it } from "vitest";
import {
  browserRedirectDecision,
  chromeIntentUrl,
  detectIOS,
  detectInAppBrowser,
} from "@/lib/in-app-browser";

const LINE_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36 Line/13.6.0";
const LINE_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.6.0";
const FACEBOOK_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36 [FBAN/FB4A;FBAV/430.0.0.0;]";
const MESSENGER_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/430.0.0.0;]";
const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.93";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 12; SM-A125F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.5481.65 Mobile Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IPADOS_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

describe("detectInAppBrowser", () => {
  it("flags branded webviews", () => {
    expect(detectInAppBrowser(LINE_ANDROID)).toBe("line");
    expect(detectInAppBrowser(LINE_IOS)).toBe("line");
    expect(detectInAppBrowser(FACEBOOK_ANDROID)).toBe("facebook");
    expect(detectInAppBrowser(MESSENGER_IOS)).toBe("messenger");
    expect(detectInAppBrowser(INSTAGRAM_IOS)).toBe("instagram");
  });

  it("flags a generic Android WebView", () => {
    expect(detectInAppBrowser(ANDROID_WEBVIEW)).toBe("android-webview");
  });

  it("does not flag real browsers", () => {
    expect(detectInAppBrowser(ANDROID_CHROME)).toBeNull();
    expect(detectInAppBrowser(IOS_SAFARI)).toBeNull();
    expect(detectInAppBrowser(DESKTOP_CHROME)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
  });
});

describe("detectIOS", () => {
  it("detects iPhone, iPad, and iPadOS-as-desktop", () => {
    expect(detectIOS(IOS_SAFARI)).toBe(true);
    expect(
      detectIOS(
        "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
      )
    ).toBe(true);
    expect(detectIOS(IPADOS_SAFARI)).toBe(true);
  });

  it("returns false elsewhere", () => {
    expect(detectIOS(ANDROID_CHROME)).toBe(false);
    expect(detectIOS(DESKTOP_CHROME)).toBe(false);
  });
});

describe("chromeIntentUrl", () => {
  it("builds a Chrome intent with an encoded fallback", () => {
    const target = "https://tax.example.com/r/tax-report-aug-2026-ABCD?x=1";
    expect(chromeIntentUrl(target)).toBe(
      "intent://tax.example.com/r/tax-report-aug-2026-ABCD?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Ftax.example.com%2Fr%2Ftax-report-aug-2026-ABCD%3Fx%3D1;end"
    );
  });
});

describe("browserRedirectDecision", () => {
  it("does nothing in a real browser", () => {
    expect(browserRedirectDecision(DESKTOP_CHROME, false)).toBeNull();
    expect(browserRedirectDecision(IOS_SAFARI, false)).toBeNull();
    expect(browserRedirectDecision("", false)).toBeNull();
  });

  it("auto-redirects an Android webview on the first attempt", () => {
    expect(browserRedirectDecision(ANDROID_WEBVIEW, false)).toBe("auto");
    expect(browserRedirectDecision(LINE_ANDROID, false)).toBe("auto");
  });

  it("falls back to manual on iOS (cannot auto-open Safari)", () => {
    expect(browserRedirectDecision(LINE_IOS, false)).toBe("manual");
    expect(browserRedirectDecision(MESSENGER_IOS, false)).toBe("manual");
  });

  it("falls back to manual when an attempt already failed", () => {
    expect(browserRedirectDecision(ANDROID_WEBVIEW, true)).toBe("manual");
    expect(browserRedirectDecision(LINE_ANDROID, true)).toBe("manual");
  });
});
