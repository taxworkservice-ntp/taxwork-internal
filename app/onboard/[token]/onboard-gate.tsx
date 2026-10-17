"use client";

import { useEffect, useState } from "react";
import {
  browserRedirectDecision,
  chromeIntentUrl,
  detectInAppBrowser,
  detectIOS,
  IN_APP_BROWSER_LABELS,
  type InAppBrowser,
} from "@/lib/in-app-browser";

/**
 * Bounce LINE/Facebook/… in-app browsers to a real browser before the
 * prospect interacts with the form. Uploads, the signature canvas, and
 * Print-to-PDF are unreliable inside these webviews. Mirrors the monthly-report
 * share gate: auto-attempt on Android (once per session), manual tap/copy on
 * iOS. Notices (expired/revoked/submitted) render without the gate.
 */
export default function OnboardGate({
  firmName,
  children,
}: {
  firmName: string;
  children: React.ReactNode;
}) {
  const [inApp, setInApp] = useState<InAppBrowser | null>(null);
  const [ios, setIos] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const here = window.location.href;
    setUrl(here);
    setIos(detectIOS(ua));
    const kind = detectInAppBrowser(ua);
    if (!kind) return;
    setInApp(kind);

    const guardKey = "onboard-open-browser";
    let attempted = false;
    try {
      attempted = sessionStorage.getItem(guardKey) === "1";
    } catch {
      // storage unavailable — treat as not attempted
    }
    if (browserRedirectDecision(ua, attempted) !== "auto") {
      setManual(true);
      return;
    }
    try {
      sessionStorage.setItem(guardKey, "1");
    } catch {
      // ignore
    }
    setRedirecting(true);
    window.location.replace(chromeIntentUrl(here));
    const t = window.setTimeout(() => {
      setRedirecting(false);
      setManual(true);
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url || window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  if (!inApp) return <>{children}</>;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4 pb-[env(safe-area-inset-bottom)]">
      <header className="text-center">
        <div className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
          {firmName}
        </div>
        <h1 className="mt-1 text-lg font-bold text-neutral-900">เปิดแบบฟอร์มในเบราว์เซอร์</h1>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        {redirecting && !manual ? (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-2 text-center">
            <span
              aria-hidden="true"
              className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900"
            />
            <p className="text-sm font-medium text-neutral-700">กำลังเปิดเบราว์เซอร์...</p>
          </div>
        ) : ios ? (
          <div className="space-y-3 text-center">
            <p className="text-sm leading-relaxed text-neutral-700">
              ลิงก์นี้เปิดจาก {IN_APP_BROWSER_LABELS[inApp]} บน iPhone/iPad ซึ่งแนบไฟล์และลงลายมือชื่อได้ไม่แน่นอน
            </p>
            <p className="text-sm leading-relaxed text-neutral-700">
              แตะปุ่ม <span className="font-semibold text-neutral-900">⋯</span> มุมขวาบน แล้วเลือก{" "}
              <span className="font-semibold text-neutral-900">“เปิดใน Safari”</span>
            </p>
            <button type="button" onClick={copyLink} className="btn w-full py-3">
              {copied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์"}
            </button>
            <p className="text-xs text-neutral-500">หรือคัดลอกลิงก์ไปวางใน Safari เพื่อกรอกแบบฟอร์ม</p>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm leading-relaxed text-neutral-700">
              ลิงก์นี้เปิดจาก {IN_APP_BROWSER_LABELS[inApp]} ซึ่งแนบไฟล์และลงลายมือชื่อได้ไม่แน่นอน
            </p>
            <a href={url ? chromeIntentUrl(url) : undefined} className="btn-primary block w-full py-3">
              เปิดในเบราว์เซอร์
            </a>
            <p className="text-xs text-neutral-500">
              หรือแตะ <span className="font-semibold text-neutral-900">⋮</span> มุมขวาบน แล้วเลือก{" "}
              <span className="font-semibold text-neutral-900">เปิดใน Chrome</span>
            </p>
          </div>
        )}
      </section>

      <footer className="text-center text-[11px] text-neutral-400">
        <p>ข้อมูลของท่านจะถูกเก็บเป็นความลับ กรุณาอย่าแชร์ลิงก์นี้</p>
      </footer>
    </main>
  );
}
