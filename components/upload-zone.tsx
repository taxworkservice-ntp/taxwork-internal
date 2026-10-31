"use client";

import { useRef, useState } from "react";
import { recordFile } from "@/lib/actions/files";
import CreatableSelect from "@/components/creatable-select";

type QueueItem = { id: string; name: string; status: "uploading" | "done" | "error" };

export type UploadResult = { ok: number; failed: number };

export default function UploadZone({
  noteOptions = [],
  showNote = true,
  large = false,
  onUploaded,
  onResult,
}: {
  noteOptions?: string[];
  showNote?: boolean;
  large?: boolean;
  onUploaded?: () => void | Promise<void>;
  onResult?: (result: UploadResult) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef(0);

  async function uploadFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;

    const batch = ++batchRef.current;
    setUploading(true);

    const items: QueueItem[] = files.map((file, index) => ({
      id: `${batch}-${index}`,
      name: file.name,
      status: "uploading",
    }));
    setQueue(items);

    const setStatus = (index: number, status: QueueItem["status"]) =>
      setQueue((prev) => prev.map((item, i) => (i === index ? { ...item, status } : item)));

    let ok = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const signRes = await fetch("/api/files/sign-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: "", fileName: file.name }),
        });
        if (!signRes.ok) throw new Error("sign");

        const { url, path } = (await signRes.json()) as { url: string; path: string };
        const putRes = await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!putRes.ok) throw new Error("put");

        await recordFile({
          client_id: null,
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type,
          note: note || null,
        });

        setStatus(i, "done");
        ok++;
      } catch {
        setStatus(i, "error");
        failed++;
      }
    }

    setUploading(false);
    setNote("");
    if (inputRef.current) inputRef.current.value = "";
    onResult?.({ ok, failed });

    try {
      await onUploaded?.();
    } catch {
      // The upload already succeeded; a refresh failure should not surface as an upload error.
    }

    setTimeout(() => {
      if (batchRef.current === batch) setQueue([]);
    }, 4000);
  }

  function openPicker() {
    if (!uploading) inputRef.current?.click();
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files);
        }}
        disabled={uploading}
      />

      {showNote && (
        <div>
          <label className="label">หมายเหตุสำหรับไฟล์ชุดนี้ (ไม่บังคับ)</label>
          <CreatableSelect
            value={note}
            onChange={setNote}
            options={noteOptions}
            placeholder="เลือกหรือพิมพ์หมายเหตุใหม่..."
            disabled={uploading}
            className="max-w-md"
          />
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-busy={uploading}
        aria-label="อัปโหลดไฟล์"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading && e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          large ? "py-12" : "py-9"
        } ${
          dragging
            ? "border-blue-500 bg-blue-50"
            : "border-neutral-300 bg-neutral-50/70 hover:border-blue-300 hover:bg-blue-50/40"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
          {uploading ? (
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M12 16V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <p className="text-sm font-semibold text-neutral-800">
          {uploading
            ? "กำลังอัปโหลด..."
            : dragging
              ? "วางไฟล์ที่นี่"
              : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"}
        </p>
        <p className="text-xs text-neutral-500">รองรับหลายไฟล์พร้อมกัน</p>
      </div>

      {queue.length > 0 && (
        <ul className="space-y-1.5">
          {queue.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${
                  item.status === "done"
                    ? "text-emerald-600"
                    : item.status === "error"
                      ? "text-red-600"
                      : "text-blue-600"
                }`}
              >
                {item.status === "uploading" ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : item.status === "done" ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M3 8.5L6.5 12L13 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-neutral-700">{item.name}</span>
              <span className="shrink-0 text-neutral-500">
                {item.status === "uploading" ? "กำลังอัปโหลด" : item.status === "done" ? "สำเร็จ" : "ล้มเหลว"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
