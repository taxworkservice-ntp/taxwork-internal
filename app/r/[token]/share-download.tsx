"use client";

import { useState } from "react";
import { downloadFromUrl } from "@/lib/download";

/**
 * Client-facing PDF download that reliably saves the file to the device instead
 * of opening a preview. On tap it fetches the report through the same-origin
 * route and saves the blob; if that fails it falls back to navigating (the route
 * sends `Content-Disposition: attachment`). In-app browsers are handled earlier,
 * at the tax-ID gate.
 */
export default function ShareDownloadButton({
  pdfUrl,
  fileName,
}: {
  pdfUrl: string;
  fileName: string | null;
}) {
  const [busy, setBusy] = useState(false);

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
    <a
      href={pdfUrl}
      download={fileName ?? undefined}
      onClick={handleClick}
      aria-busy={busy}
      className="block rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm active:bg-neutral-800"
    >
      {busy ? "กำลังดาวน์โหลด..." : "ดาวน์โหลดรายงานฉบับเต็ม (PDF)"}
    </a>
  );
}
