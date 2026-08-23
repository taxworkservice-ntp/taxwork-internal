"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("files")
      .select("*")
      .eq("client_id", clientId)
      .order("uploaded_at", { ascending: false });
    setFiles(data ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const path = `${clientId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage
        .from("client-files")
        .upload(path, file);
      if (!error) {
        await supabase.from("files").insert({
          client_id: clientId,
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type,
        });
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    load();
    onChanged?.();
  }

  async function remove(file: FileRow) {
    if (!confirm(`ลบไฟล์ ${file.file_name}?`)) return;
    await supabase.storage.from("client-files").remove([file.storage_path]);
    await supabase.from("files").delete().eq("id", file.id);
    load();
    onChanged?.();
  }

  async function download(file: FileRow) {
    const { data } = await supabase.storage
      .from("client-files")
      .createSignedUrl(file.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <section className="max-w-xl">
      <div className="mb-2 flex items-center justify-between">
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
      <table className="table-base">
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
    </section>
  );
}
