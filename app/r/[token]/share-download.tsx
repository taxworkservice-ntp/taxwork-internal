"use client";

import { useEffect, useState } from "react";
import {
  chromeIntentUrl,
  detectInAppBrowser,
  detectIOS,
  IN_APP_BROWSER_LABELS,
  type InAppBrowser,
} from "@/lib/in-app-browser";
import { downloadFromUrl } from "@/lib/download";

/**
 * Client-facing PDF download that reliably saves the file to the device instead
 * of opening a preview. On tap it fetches the report through the same-origin
 * route and saves the blob; if that fails it falls back to navigating (the route
 * sends `Content-Disposition: attachment`). Inside an in-app browser (LINE,
 * Facebook, …) it also warns and offers a route out to a real browser, since
 * those webviews swallow downloads.
 */
export default function ShareDownloadButton({
  pdfUrl,
  fileName,
}: {
  pdfUrl: string;
  fileName: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [inApp, setInApp] = useState<InAppBrowser | null>(null);
  const [ios, setIos] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setInApp(detectInAppBrowser(ua));
    setIos(detectIOS(ua));
    setCurrentUrl(window.location.href);
  }, []);

  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let modifier/middle clicks and right-click "save link as" use the plain
    // anchor — the server response is already an attachment.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await downloadFromUrl(pdfUrl, fileName ?? undefined);
    } catch {
      window.location.assign(pdfUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <a
        href={pdfUrl}
        download={fileName ?? undefined}
        onClick={handleClick}
        aria-busy={busy}
        className="block rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm active:bg-neutral-800"
      >
        {busy ? "กำลังดาวน์โหลด..." : "ดาวน์โหลดรายงานฉบับเต็ม (PDF)"}
      </a>

      {inApp && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <div className="font-semibold">
            เปิดในเบราว์เซอร์เพื่อให้ดาวน์โหลดได้
          </div>
          <p className="mt-0.5 text-amber-700">
            ลิงก์นี้เปิดจาก {IN_APP_BROWSER_LABELS[inApp]} ซึ่งดาวน์โหลดไฟล์ได้ไม่แน่นอน
            {ios
              ? " กรุณาแตะ ⋯ มุมขวาบน แล้วเลือก “เปิดใน Safari”"
              : " กรุณาเปิดลิงก์ด้วยเบราว์เซอร์"}
          </p>
          {!ios && currentUrl && (
            <a
              href={chromeIntentUrl(currentUrl)}
              className="mt-2 inline-block rounded-md border border-amber-400 bg-white px-3 py-1.5 font-medium text-amber-800"
            >
              เปิดในเบราว์เซอร์
            </a>
          )}
        </div>
      )}
    </div>
  );
}
