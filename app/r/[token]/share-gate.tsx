"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { verifyShareTaxId } from "@/lib/actions/reports";
import {
  browserRedirectDecision,
  chromeIntentUrl,
  detectInAppBrowser,
  detectIOS,
  IN_APP_BROWSER_LABELS,
  type InAppBrowser,
} from "@/lib/in-app-browser";

function formatExpiry(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Client-facing tax-ID gate shown before a shared report is revealed. On a
 * correct number the server sets a signed access cookie, then we refresh so the
 * server component re-renders with the report. The submit shows a two-stage
 * overlay ("checking" → "opening") so the wait is legible rather than a frozen
 * form.
 */
export default function ShareGate({
  token,
  firmName,
  expiresAt,
  hasTaxId,
}: {
  token: string;
  firmName: string;
  expiresAt?: string | null;
  hasTaxId: boolean;
}) {
  const router = useRouter();
  const [taxId, setTaxId] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"idle" | "verifying" | "opening">("idle");
  const expiry = formatExpiry(expiresAt);
  const digits = 4;
  const busy = stage !== "idle";
  const stageLabel =
    stage === "verifying" ? "กำลังตรวจสอบข้อมูล..." : "กำลังเปิดรายงาน...";

  // In-app browser (LINE/Facebook/…) handling: bounce to a real browser before
  // the client enters anything. Downloads fail inside these webviews, and the
  // tax-ID session would not carry across separate browser cookie stores.
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

    // Only auto-attempt once per session so a blocked intent that falls back to
    // the webview cannot loop.
    const guardKey = `share-open-browser:${token}`;
    let attempted = false;
    try {
      attempted = sessionStorage.getItem(guardKey) === "1";
    } catch {
      // storage unavailable (private mode) — treat as not attempted
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
  }, [token]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url || window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setStage("verifying");
    setError("");
    try {
      const res = await verifyShareTaxId(token, taxId);
      if (res.ok) {
        setStage("opening");
        router.refresh();
        return;
      }
      setError(res.error);
      setStage("idle");
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setStage("idle");
    }
  }

  if (inApp) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
        <header className="text-center">
          <div className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
            {firmName}
          </div>
          <h1 className="mt-1 text-lg font-bold text-neutral-900">
            เปิดรายงานในเบราว์เซอร์
          </h1>
        </header>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          {redirecting && !manual ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-3 py-2 text-center"
            >
              <span
                aria-hidden="true"
                className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900"
              />
              <p className="text-sm font-medium text-neutral-700">
                กำลังเปิดเบราว์เซอร์...
              </p>
            </div>
          ) : ios ? (
            <div className="space-y-3 text-center">
              <p className="text-sm leading-relaxed text-neutral-700">
                ลิงก์นี้เปิดจาก {IN_APP_BROWSER_LABELS[inApp]} บน iPhone/iPad
                ซึ่งดาวน์โหลดไฟล์ได้ไม่แน่นอน
              </p>
              <p className="text-sm leading-relaxed text-neutral-700">
                แตะปุ่ม{" "}
                <span className="font-semibold text-neutral-900">⋯</span>{" "}
                มุมขวาบน แล้วเลือก{" "}
                <span className="font-semibold text-neutral-900">
                  “เปิดใน Safari”
                </span>
              </p>
              <button type="button" onClick={copyLink} className="btn w-full">
                {copied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์"}
              </button>
              <p className="text-xs text-neutral-500">
                หรือคัดลอกลิงก์ไปวางใน Safari เพื่อเปิดรายงานและดาวน์โหลดไฟล์
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm leading-relaxed text-neutral-700">
                ลิงก์นี้เปิดจาก {IN_APP_BROWSER_LABELS[inApp]}{" "}
                ซึ่งดาวน์โหลดไฟล์ได้ไม่แน่นอน
              </p>
              <a
                href={url ? chromeIntentUrl(url) : undefined}
                className="btn-primary block w-full"
              >
                เปิดในเบราว์เซอร์
              </a>
              <p className="text-xs text-neutral-500">
                หรือแตะ{" "}
                <span className="font-semibold text-neutral-900">⋮</span>{" "}
                มุมขวาบน แล้วเลือก{" "}
                <span className="font-semibold text-neutral-900">
                  เปิดใน Chrome
                </span>
              </p>
            </div>
          )}
        </section>

        <footer className="text-center text-[11px] text-neutral-400">
          <p>เอกสารนี้เป็นความลับสำหรับลูกค้าเท่านั้น กรุณาอย่าแชร์ลิงก์นี้</p>
          {expiry && <p className="mt-0.5">ลิงก์นี้ใช้ได้ถึง {expiry}</p>}
        </footer>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
      <header className="text-center">
        <div className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
          {firmName}
        </div>
        <h1 className="mt-1 text-lg font-bold text-neutral-900">
          ยืนยันตัวตนเพื่อเปิดรายงาน
        </h1>
      </header>

      <section
        className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
        aria-busy={busy}
      >
        {hasTaxId ? (
          <div className="relative">
            <form
              onSubmit={submit}
              className={`space-y-3 transition-opacity ${
                busy ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <div>
                <label htmlFor="share-tax-id" className="label">
                  เลขท้าย {digits} หลักของเลขประจำตัวผู้เสียภาษี
                </label>
                <input
                  id="share-tax-id"
                  className="input font-mono tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  maxLength={digits}
                  placeholder="0000"
                  value={taxId}
                  disabled={busy}
                  onChange={(e) =>
                    setTaxId(e.target.value.replace(/\D+/g, "").slice(0, digits))
                  }
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || taxId.length !== digits}
                className="btn-primary w-full"
              >
                {busy ? stageLabel : "เปิดรายงาน"}
              </button>

              <p className="text-xs leading-relaxed text-neutral-500">
                ไม่ทราบเลขท้าย {digits} หลัก? ดูได้จากใบกำกับภาษี หนังสือรับรองบริษัท
                หรือแบบ ภ.พ.30
              </p>
            </form>

            {busy && (
              <div
                role="status"
                aria-live="polite"
                className="animate-fade-in absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/70 text-center"
              >
                <span
                  aria-hidden="true"
                  className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900"
                />
                <span className="text-sm font-medium text-neutral-700">
                  {stageLabel}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            ลิงก์นี้ยังไม่พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่ผู้ดูแล
          </p>
        )}
      </section>

      <footer className="text-center text-[11px] text-neutral-400">
        <p>เอกสารนี้เป็นความลับสำหรับลูกค้าเท่านั้น กรุณาอย่าแชร์ลิงก์นี้</p>
        {expiry && <p className="mt-0.5">ลิงก์นี้ใช้ได้ถึง {expiry}</p>}
      </footer>
    </main>
  );
}
