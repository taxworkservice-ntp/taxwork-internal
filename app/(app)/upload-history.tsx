"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { downloadStoredFile } from "@/lib/download";
import { findNewUploads, type HomeUploadFile } from "@/lib/home-uploads";
import { ToastStack, useToasts } from "@/components/toast";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const DOC_EXT = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

function fmtSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fmtDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fileBadge(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    return { label: "PDF", className: "border-red-200 bg-red-50 text-red-700" };
  }
  if (IMAGE_EXT.has(ext)) {
    return { label: "IMG", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (DOC_EXT.has(ext)) {
    return { label: "DOC", className: "border-blue-200 bg-blue-50 text-blue-700" };
  }
  return { label: "FILE", className: "border-neutral-200 bg-neutral-50 text-neutral-600" };
}

function uploaderLabel(email: string | null, names: Record<string, string>) {
  if (!email) return "ไม่ทราบผู้อัปโหลด";
  return names[email.trim().toLowerCase()] ?? email;
}

function StaffAvatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-100 text-[10px] font-semibold text-blue-700">
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

function FileRow({
  file,
  isNew,
  uploaderName,
  onError,
}: {
  file: HomeUploadFile;
  isNew?: boolean;
  uploaderName?: string;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const badge = fileBadge(file.file_name);

  async function handleDownload() {
    setBusy(true);
    try {
      await downloadStoredFile({
        storagePath: file.storage_path,
        fileName: file.file_name,
      });
    } catch {
      onError(`ดาวน์โหลด "${file.file_name}" ไม่สำเร็จ กรุณาลองอีกครั้ง`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold ${badge.className}`}
        >
          {badge.label}
        </span>

        <div className="min-w-0 flex-1">
          {uploaderName && (
            <div className="mb-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
              <StaffAvatar name={uploaderName} />
              <span className="truncate">{uploaderName}</span>
            </div>
          )}
          <div
            className="truncate text-[15px] font-medium text-neutral-900"
            title={file.file_name}
          >
            {file.file_name}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {fmtSize(file.size_bytes)} · {fmtDate(file.uploaded_at)}
          </div>
        </div>

        {isNew && (
          <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            ใหม่
          </span>
        )}

        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="btn-primary inline-flex min-h-10 w-full items-center justify-center gap-1.5 px-4 sm:w-auto"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M12 4v12M8 12l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 20h16" strokeLinecap="round" />
          </svg>
          {busy ? "กำลังดาวน์โหลด..." : "ดาวน์โหลด"}
        </button>
      </div>
    </li>
  );
}

function UploadSection({
  title,
  subtitle,
  count,
  newCount,
  accent = false,
  icon,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  newCount?: number;
  accent?: boolean;
  icon: ReactNode;
  empty?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
        accent ? "border-blue-200" : "border-neutral-200"
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5 ${
          accent
            ? "border-blue-100 bg-gradient-to-r from-blue-50 via-blue-50/60 to-white"
            : "border-neutral-100 bg-white"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              accent ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
            <p className="text-xs text-neutral-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {newCount ? (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              ใหม่ {newCount}
            </span>
          ) : null}
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {count} ไฟล์
          </span>
          <Link href="/files" className="text-xs font-medium text-blue-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
      </div>

      {empty ? (
        <div className="px-5 py-8 text-center text-sm text-neutral-500">{empty}</div>
      ) : (
        <ul className="divide-y divide-neutral-100">{children}</ul>
      )}
    </section>
  );
}

export default function UploadHistory({
  viewerEmail,
  mine,
  team,
  mineCount,
  teamCount,
  uploaderNames,
}: {
  viewerEmail: string;
  mine: HomeUploadFile[];
  team: HomeUploadFile[];
  mineCount: number;
  teamCount: number;
  uploaderNames: Record<string, string>;
}) {
  const { toasts, push, dismiss } = useToasts();
  const teamRef = useRef<HTMLDivElement>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const lastSeenKey = `home.uploads.lastSeen.${viewerEmail.trim().toLowerCase()}`;

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(lastSeenKey);
    } catch {
      raw = null;
    }
    const lastSeen = raw == null ? null : Number(raw);
    const fresh = findNewUploads(team, lastSeen);
    setNewIds(new Set(fresh.map((file) => file.id)));
  }, [lastSeenKey, team]);

  useEffect(() => {
    const node = teamRef.current;
    if (!node || team.length === 0) return;

    const markSeen = () => {
      try {
        localStorage.setItem(lastSeenKey, String(Date.now()));
      } catch {
        // Storage can be unavailable in private mode; the list still works.
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      markSeen();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markSeen();
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lastSeenKey, team.length]);

  function handleError(message: string) {
    push({ type: "error", message });
  }

  if (!mineCount && !teamCount) {
    return (
      <section className="rounded-xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center">
        <p className="text-sm font-medium text-neutral-800">ยังไม่มีไฟล์</p>
        <p className="mt-1 text-xs text-neutral-500">
          อัปโหลดไฟล์แรกจากกล่องด้านบน แล้วไฟล์จะแสดงที่นี่
        </p>
      </section>
    );
  }

  return (
    <div ref={teamRef} className="space-y-4">
      {teamCount > 0 && (
        <UploadSection
          title="ไฟล์จากทีม"
          subtitle="อัปโหลดล่าสุดโดยเพื่อนร่วมทีม"
          count={teamCount}
          newCount={newIds.size}
          accent
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        >
          {team.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              isNew={newIds.has(file.id)}
              uploaderName={uploaderLabel(file.uploaded_by, uploaderNames)}
              onError={handleError}
            />
          ))}
        </UploadSection>
      )}

      <UploadSection
        title="ไฟล์ของฉัน"
        subtitle="อัปโหลดล่าสุดโดยคุณ"
        count={mineCount}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        }
        empty={
          mineCount === 0
            ? "ยังไม่มีไฟล์ที่คุณอัปโหลด — ใช้กล่องอัปโหลดด้านบนได้เลย"
            : undefined
        }
      >
        {mine.map((file) => (
          <FileRow key={file.id} file={file} onError={handleError} />
        ))}
      </UploadSection>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
