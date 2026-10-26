"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteFileRecord,
  listClientFiles,
  recordFile,
  updateFileCategory,
  type FileRow,
} from "@/lib/actions/files";
import { downloadStoredFile } from "@/lib/download";
import {
  FILE_CATEGORY_GROUPS,
  normalizeFileCategory,
  splitClientFiles,
} from "@/lib/file-categories";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx";

function fmtSize(bytes: number) {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fileBadge(file: FileRow): { label: string; className: string } {
  const name = file.file_name.toLowerCase();
  if (file.mime_type === "application/pdf" || name.endsWith(".pdf")) {
    return { label: "PDF", className: "border-red-200 bg-red-50 text-red-700" };
  }
  if (
    (file.mime_type?.startsWith("image/") ?? false) ||
    /\.(png|jpe?g|gif|webp)$/.test(name)
  ) {
    return {
      label: "IMG",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (/\.(docx?|xlsx?|pptx?)$/.test(name)) {
    return {
      label: "DOC",
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  return {
    label: "FILE",
    className: "border-neutral-200 bg-neutral-50 text-neutral-600",
  };
}

function categoryOf(file: FileRow): string {
  return normalizeFileCategory(file.category);
}

export default function FileSection({
  clientId,
  onChanged,
}: {
  clientId: string;
  onChanged?: () => void;
}) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setFiles(await listClientFiles(clientId));
    } catch {
      setError("โหลดรายการเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const { groups, systemReports } = useMemo(
    () => splitClientFiles(files),
    [files]
  );

  async function upload(category: string, input: HTMLInputElement) {
    const list = input.files;
    if (!list?.length) return;

    setUploadingCategory(category);
    setError("");
    let failed = 0;

    for (const file of Array.from(list)) {
      try {
        const signRes = await fetch("/api/files/sign-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, fileName: file.name }),
        });
        if (!signRes.ok) throw new Error("sign");
        const { url, path } = (await signRes.json()) as {
          url: string;
          path: string;
        };

        const putRes = await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!putRes.ok) throw new Error("upload");

        await recordFile({
          client_id: clientId,
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || "application/octet-stream",
          category,
        });
      } catch {
        failed += 1;
      }
    }

    setUploadingCategory(null);
    input.value = "";
    if (failed) {
      setError(`อัปโหลดไม่สำเร็จ ${failed} ไฟล์ กรุณาลองอีกครั้ง`);
    }
    await load();
    onChanged?.();
  }

  async function remove(file: FileRow) {
    if (!confirm(`ลบไฟล์ "${file.file_name}"?`)) return;
    setDeletingId(file.id);
    setError("");
    try {
      const res = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: file.storage_path }),
      });
      if (!res.ok) throw new Error("delete");
      await deleteFileRecord(file.id);
      await load();
      onChanged?.();
    } catch {
      setError(`ลบไฟล์ "${file.file_name}" ไม่สำเร็จ`);
    } finally {
      setDeletingId(null);
    }
  }

  async function changeCategory(file: FileRow, category: string) {
    if (category === categoryOf(file)) return;
    setError("");
    try {
      await updateFileCategory(file.id, category);
      await load();
    } catch {
      setError("ย้ายหมวดเอกสารไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  }

  async function download(file: FileRow) {
    try {
      await downloadStoredFile({
        storagePath: file.storage_path,
        fileName: file.file_name,
      });
    } catch {
      setError(`ดาวน์โหลด "${file.file_name}" ไม่สำเร็จ`);
    }
  }

  const totalDocuments = files.length - systemReports.length;
  const busy = uploadingCategory !== null;

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">เอกสารสำคัญของบริษัท</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
            จัดเก็บหนังสือรับรอง หนังสือบริคณห์สนธิ เอกสารกรรมการ และเอกสารภาษีของลูกค้า
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
          {totalDocuments} ไฟล์
        </span>
      </div>

      {error && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 text-red-500 hover:text-red-700"
            onClick={() => setError("")}
            aria-label="ปิดข้อความแจ้งเตือน"
          >
            ปิด
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-neutral-100"
            />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {groups.map((group) => (
            <div
              key={group.key}
              className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[200px_1fr] md:gap-6"
            >
              <div className="flex items-start justify-between gap-2 md:block">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                      <DocumentIcon />
                    </span>
                    <span className="text-sm font-medium text-neutral-800">
                      {group.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-neutral-400">
                    {group.hint}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 md:mt-2 md:inline-block">
                  {group.files.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {group.files.map((file) => (
                  <DocumentRow
                    key={file.id}
                    file={file}
                    deleting={deletingId === file.id}
                    disabled={busy}
                    onDownload={() => download(file)}
                    onChangeCategory={(category) => changeCategory(file, category)}
                    onRemove={() => remove(file)}
                  />
                ))}
                <UploadControl
                  category={group.key}
                  hasFiles={group.files.length > 0}
                  busy={uploadingCategory === group.key}
                  disabled={busy}
                  onUpload={upload}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {systemReports.length > 0 && (
        <div className="mt-4 border-t border-neutral-200 pt-3">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">รายงานภาษีที่ออกโดยระบบ</h3>
              <p className="text-[11px] text-neutral-400">
                ไฟล์ PDF ที่สร้างจากหน้ารายงาน — จัดการได้ที่หน้ารายงาน
              </p>
            </div>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
              {systemReports.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {systemReports.map((file) => (
              <SystemReportRow
                key={file.id}
                file={file}
                onDownload={() => download(file)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DocumentRow({
  file,
  deleting,
  disabled,
  onDownload,
  onChangeCategory,
  onRemove,
}: {
  file: FileRow;
  deleting: boolean;
  disabled: boolean;
  onDownload: () => void;
  onChangeCategory: (category: string) => void;
  onRemove: () => void;
}) {
  const badge = fileBadge(file);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
      <span
        className={`flex h-8 w-10 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${badge.className}`}
      >
        {badge.label}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onDownload}
          className="block max-w-full truncate text-left text-sm font-medium text-neutral-800 hover:text-blue-700 hover:underline"
          title={`ดาวน์โหลด ${file.file_name}`}
        >
          {file.file_name}
        </button>
        <div className="text-[11px] text-neutral-400">
          {fmtSize(file.size_bytes)} · {fmtDate(file.uploaded_at)}
        </div>
      </div>
      <select
        className="max-w-[150px] rounded border border-neutral-200 bg-white px-1.5 py-1 text-[11px] text-neutral-600 focus:border-blue-400 focus:outline-none"
        value={categoryOf(file)}
        onChange={(e) => onChangeCategory(e.target.value)}
        disabled={disabled}
        aria-label="หมวดเอกสาร"
        title="ย้ายหมวดเอกสาร"
      >
        {FILE_CATEGORY_GROUPS.map((group) => (
          <option key={group.key} value={group.key}>
            {group.shortLabel}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        onClick={onRemove}
        disabled={disabled || deleting}
        aria-label={`ลบไฟล์ ${file.file_name}`}
        title="ลบไฟล์"
      >
        {deleting ? (
          <span className="block text-[10px]">...</span>
        ) : (
          <TrashIcon />
        )}
      </button>
    </div>
  );
}

function SystemReportRow({
  file,
  onDownload,
}: {
  file: FileRow;
  onDownload: () => void;
}) {
  const badge = fileBadge(file);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/60 px-2.5 py-2">
      <span
        className={`flex h-8 w-10 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${badge.className}`}
      >
        {badge.label}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onDownload}
          className="block max-w-full truncate text-left text-sm font-medium text-neutral-700 hover:text-blue-700 hover:underline"
          title={`ดาวน์โหลด ${file.file_name}`}
        >
          {file.file_name}
        </button>
        <div className="text-[11px] text-neutral-400">
          {fmtSize(file.size_bytes)} · {fmtDate(file.uploaded_at)} · สร้างโดยระบบ
        </div>
      </div>
      <button
        type="button"
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
        onClick={onDownload}
      >
        ดาวน์โหลด
      </button>
    </div>
  );
}

function UploadControl({
  category,
  hasFiles,
  busy,
  disabled,
  onUpload,
}: {
  category: string;
  hasFiles: boolean;
  busy: boolean;
  disabled: boolean;
  onUpload: (category: string, input: HTMLInputElement) => void;
}) {
  const blocked = disabled || busy;
  return (
    <label
      className={
        hasFiles
          ? `inline-flex cursor-pointer items-center gap-1.5 rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 ${
              blocked ? "pointer-events-none opacity-50" : ""
            }`
          : `flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700 ${
              blocked ? "pointer-events-none opacity-50" : ""
            }`
      }
    >
      {busy ? (
        "กำลังอัปโหลด..."
      ) : hasFiles ? (
        "+ อัปโหลด"
      ) : (
        <>
          <UploadIcon />
          <span>อัปโหลดไฟล์</span>
          <span className="text-[10px] text-neutral-400">
            PDF, รูปภาพ, Word, Excel
          </span>
        </>
      )}
      <input
        type="file"
        multiple
        className="hidden"
        accept={ACCEPT}
        disabled={blocked}
        onChange={(e) => {
          const input = e.currentTarget;
          void onUpload(category, input);
        }}
      />
    </label>
  );
}

function DocumentIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path
        d="M4 2h5l3 3v9H4zM9 2v3h3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path
        d="M8 11V3M5 6l3-3 3 3M3 13h10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path
        d="M3 4h10M6 4V2.5h4V4M4.5 4l.5 9h6l.5-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
