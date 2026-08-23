"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type FileRow = {
  id: string;
  client_id: string | null;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  clients: { name: string } | null;
};

export default function FilesPage() {
  const supabase = createClient();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("files")
      .select("*, clients(name)")
      .order("uploaded_at", { ascending: false });
    setFiles(data ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const owner = clientId || "general";
      const path = `${owner}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("client-files").upload(path, file);
      if (!error) {
        await supabase.from("files").insert({
          client_id: clientId || null,
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type,
        });
      }
    }
    setUploading(false);
    load();
  }

  async function remove(file: FileRow) {
    if (!confirm(`Delete ${file.file_name}?`)) return;
    await supabase.storage.from("client-files").remove([file.storage_path]);
    await supabase.from("files").delete().eq("id", file.id);
    load();
  }

  async function download(file: FileRow) {
    const { data } = await supabase.storage
      .from("client-files")
      .createSignedUrl(file.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const filtered = files.filter(
    (f) =>
      f.file_name.toLowerCase().includes(search.toLowerCase()) ||
      (f.clients?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">ไฟล์</h1>
        <select className="input w-48" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">ทั่วไป (ไม่ระบุลูกค้า)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className={`btn-primary ${uploading ? "opacity-50" : ""}`}>
          {uploading ? "กำลังอัปโหลด..." : "อัปโหลด"}
          <input type="file" multiple className="hidden" onChange={upload} disabled={uploading} />
        </label>
        <div className="flex-grow" />
        <input className="input max-w-xs" placeholder="ค้นหา..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-x-auto">
      <table className="table-base w-full min-w-[640px]">
        <thead>
          <tr><th>ชื่อไฟล์</th><th>ลูกค้า</th><th>ขนาด</th><th>วันที่อัปโหลด</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.map((f) => (
            <tr key={f.id}>
              <td>
                <button className="text-blue-600 underline" onClick={() => download(f)}>{f.file_name}</button>
              </td>
              <td>
                {f.clients ? (
                  <Link href={`/clients/${f.client_id}`} className="text-blue-600 underline">{f.clients.name}</Link>
                ) : "—"}
              </td>
              <td>{f.size_bytes > 1048576 ? `${(f.size_bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(f.size_bytes / 1024)} KB`}</td>
              <td>{new Date(f.uploaded_at).toLocaleDateString()}</td>
              <td className="text-right">
                <button className="btn-danger px-1.5 py-0.5 text-xs" onClick={() => remove(f)}>ลบ</button>
              </td>
            </tr>
          ))}
          {!filtered.length && (
            <tr><td colSpan={5} className="text-neutral-500">ไม่มีไฟล์</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}
