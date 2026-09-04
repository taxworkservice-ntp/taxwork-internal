"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteFileRecord, listClientFiles, recordFile } from "@/lib/actions/files";

type FileRow = {
  id: string;
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  storage_path: string;
};

function fmtSize(bytes: number) {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function FileSection({
  clientId,
  onChanged,
}: {
  clientId: string;
  onChanged?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setFiles(await listClientFiles(clientId));
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    setUploading(true);

    for (const file of Array.from(list)) {
      // 1. get a presigned upload URL from our API
      const signRes = await fetch("/api/files/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, fileName: file.name }),
      });
      if (!signRes.ok) continue;
      const { url, path } = await signRes.json();

      // 2. upload directly to R2
      const putRes = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) continue;

      // 3. save metadata
      await recordFile({
        client_id: clientId,
        storage_path: path,
        file_name: file.name,
        size_bytes: file.size,
        mime_type: file.type,
      });
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    load();
    onChanged?.();
  }

  async function remove(file: FileRow) {
    if (!confirm(`ลบไฟล์ ${file.file_name}?`)) return;
    await fetch("/api/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath: file.storage_path }),
    });
    await deleteFileRecord(file.id);
    load();
    onChanged?.();
  }

  async function download(file: FileRow) {
    const res = await fetch("/api/files/sign-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath: file.storage_path }),
    });
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  return (
    <section className="max-w-xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">ไฟล์</h2>
        <label className={`btn ${uploading ? "opacity-50" : ""}`}>
          {uploading ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์"}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={upload}
            disabled={uploading}
          />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base w-full min-w-[540px]">
          <thead>
            <tr><th>ชื่อไฟล์</th><th>ขนาด</th><th>วันที่อัปโหลด</th><th></th></tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td>
                  <button className="text-blue-600 underline" onClick={() => download(f)}>
                    {f.file_name}
                  </button>
                </td>
                <td>{fmtSize(f.size_bytes)}</td>
                <td>{new Date(f.uploaded_at).toLocaleDateString()}</td>
                <td className="text-right">
                  <button className="btn-danger px-1.5 py-0.5 text-xs" onClick={() => remove(f)}>
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {!files.length && (
              <tr><td colSpan={4} className="text-neutral-500">ไม่มีไฟล์</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
