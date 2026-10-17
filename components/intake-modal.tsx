"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { IntakeSubmissionRow } from "@/lib/actions/intake";
import { formatTaxId } from "@/lib/tax-id";

function isImagePath(path: string): boolean {
  const l = path.toLowerCase();
  return l.endsWith(".png") || l.endsWith(".jpg") || l.endsWith(".jpeg") || l.endsWith(".webp");
}

export type IntakeDoc = { label: string; path: string | null; url?: string | null };

export function badge(status: string | null, hasClient = false) {
  const map: Record<string, string> = {
    submitted: "bg-amber-50 text-amber-700",
    approved: hasClient ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700",
    rejected: "bg-red-50 text-red-600",
  };
  const label: Record<string, string> = {
    submitted: "รอตรวจสอบ",
    approved: hasClient ? "เป็นลูกค้าแล้ว" : "ผู้สนใจ",
    rejected: "ปฏิเสธ",
  };
  if (!status)
    return <span className="text-xs text-neutral-400">รอกรอก</span>;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        map[status] ?? "bg-neutral-100 text-neutral-600"
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}

export default function IntakeModal({
  sub,
  docs,
  loadingDocs,
  onClose,
  onOpenDoc,
  onReject,
  busy,
}: {
  sub: IntakeSubmissionRow | null;
  docs: IntakeDoc[];
  loadingDocs: boolean;
  onClose: () => void;
  onOpenDoc: (path: string) => void;
  onReject: (id: string) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"info" | "docs">("info");

  useEffect(() => {
    setTab("info");
  }, [sub?.id]);

  useEffect(() => {
    if (!sub) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sub, onClose]);

  if (!sub) return null;
  const reviewed = sub.status !== "submitted";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={sub.name_th}
    >
      <button
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-4">
          <div className="min-w-0">
            <div className="truncate font-semibold">{sub.name_th}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              {badge(sub.status, Boolean(sub.client_id))}
              <span>
                {sub.juristic_id ? `เลขทะเบียน ${formatTaxId(sub.juristic_id)}` : "รอจดทะเบียน"}
              </span>
              <span>
                {sub.contact_name} · {sub.contact_phone}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1.5 border-b border-neutral-100 px-4 pt-2">
          {(["info", "docs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "border-b-2 border-neutral-900 px-2 pb-2 text-xs font-medium"
                  : "px-2 pb-2 text-xs text-neutral-500"
              }
            >
              {t === "info" ? "ข้อมูลที่ส่ง" : `เอกสาร (${docs.filter((d) => d.path).length})`}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "info" && (
            <div className="space-y-3 text-sm">
              <div className="grid gap-1 sm:grid-cols-2">
                <div>ชื่ออังกฤษ: {sub.name_en || "-"}</div>
                <div>อีเมลบริษัท: {sub.company_email || "-"}</div>
                <div>โทรบริษัท: {sub.company_phone || "-"}</div>
                <div className="sm:col-span-2">ประเภทธุรกิจ: {sub.business_desc || "-"}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-500">
                  ผู้ถือหุ้น ({sub.shareholders.length})
                </div>
                <ul className="list-inside list-disc text-xs text-neutral-600">
                  {sub.shareholders.map((sh, i) => (
                    <li key={i}>
                      {sh.name} {sh.percent && `· ${sh.percent}%`} {sh.isDirector && "· กรรมการ"} ·{" "}
                      {sh.phone} · {sh.email}
                    </li>
                  ))}
                </ul>
              </div>
              {sub.notes && <p className="text-xs text-neutral-500">หมายเหตุ: {sub.notes}</p>}
            </div>
          )}

          {tab === "docs" && (
            <div>
              {loadingDocs && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-lg bg-neutral-100" />
                  ))}
                </div>
              )}
              {!loadingDocs && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {docs
                    .filter((d) => d.path)
                    .map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onOpenDoc(d.path!)}
                        className="group overflow-hidden rounded-lg border border-neutral-200 text-left"
                      >
                        {d.url && isImagePath(d.path!) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.url} alt={d.label} className="h-24 w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-24 flex-col items-center justify-center gap-1 bg-neutral-50 text-neutral-500">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                            </svg>
                            <span className="px-1 text-center text-[10px]">PDF · เปิดดู</span>
                          </div>
                        )}
                        <div className="truncate px-2 py-1 text-[11px] text-neutral-600 group-hover:text-neutral-900">
                          {d.label}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 p-3">
          <Link href={`/onboarding/${sub.id}`} className="btn-primary text-xs">
            เปิดหน้าจดทะเบียน / ตรวจสอบ
          </Link>
          {!reviewed && (
            <button className="btn-danger text-xs" onClick={() => onReject(sub.id)} disabled={busy}>
              ปฏิเสธ
            </button>
          )}
          <button className="btn ml-auto text-xs" onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
