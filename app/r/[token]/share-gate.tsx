"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { verifyShareTaxId } from "@/lib/actions/reports";

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
 * server component re-renders with the report.
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
  const [busy, setBusy] = useState(false);
  const expiry = formatExpiry(expiresAt);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await verifyShareTaxId(token, taxId);
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(res.error);
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
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

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        {hasTaxId ? (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="share-tax-id" className="label">
                เลขประจำตัวผู้เสียภาษี (13 หลัก)
              </label>
              <input
                id="share-tax-id"
                className="input font-mono tracking-wider"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={13}
                placeholder="0-0000-00000-00-0"
                value={taxId}
                disabled={busy}
                onChange={(e) =>
                  setTaxId(e.target.value.replace(/\D+/g, "").slice(0, 13))
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
              disabled={busy || taxId.length !== 13}
              className="btn-primary w-full"
            >
              {busy ? "กำลังตรวจสอบ..." : "เปิดรายงาน"}
            </button>

            <p className="text-xs leading-relaxed text-neutral-500">
              ไม่ทราบเลขประจำตัวผู้เสียภาษี? ดูได้จากใบกำกับภาษี หนังสือรับรองบริษัท
              หรือแบบ ภ.พ.30
            </p>
          </form>
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
