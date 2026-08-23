"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import CopyButton from "@/components/copy-button";

type FileRow = {
  id: string;
  client_id: string | null;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
  clients: { name: string } | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function FilesPage() {
  const supabase = createClient();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterUser, setFilterUser] = useState("");

  const years = [...new Set(files.map((f) => new Date(f.uploaded_at).getFullYear()))].sort((a, b) => b - a);
  const users = [...new Set(files.map((f) => f.uploaded_by ?? "").filter(Boolean))].sort();
  const hasFilter = filterYear !== "" || filterMonth !== "" || filterUser !== "";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const file of Array.from(list)) {
      const signRes = await fetch("/api/files/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "", fileName: file.name }),
      });
      if (!signRes.ok) continue;
      const { url, path } = await signRes.json();
      const putRes = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) continue;
      await supabase.from("files").insert({
        client_id: null,
        storage_path: path,
        file_name: file.name,
        size_bytes: file.size,
        mime_type: file.type,
        uploaded_by: user?.email ?? null,
      });
    }
    setUploading(false);
    load();
  }

  async function remove(file: FileRow) {
    if (!confirm(`ลบไฟล์ ${file.file_name}?`)) return;
    await fetch("/api/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath: file.storage_path }),
    });
    await supabase.from("files").delete().eq("id", file.id);
    load();
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

  const filtered = files.filter((f) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !f.file_name.toLowerCase().includes(q) &&
        !(f.uploaded_by ?? "").toLowerCase().includes(q) &&
        !(f.clients?.name ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    if (filterUser && f.uploaded_by !== filterUser) return false;
    const d = new Date(f.uploaded_at);
    if (filterYear && d.getFullYear() !== Number(filterYear)) return false;
    if (filterMonth && d.getMonth() + 1 !== Number(filterMonth)) return false;
    return true;
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">ไฟล์</h1>
        <div className="flex-grow" />
        <label className={`btn-primary ${uploading ? "opacity-50" : ""}`}>
          {uploading ? "กำลังอัปโหลด..." : "อัปโหลด"}
          <input type="file" multiple className="hidden" onChange={upload} disabled={uploading} />
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input w-full sm:max-w-xs"
          placeholder="ค้นหา..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-32"
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
        >
          <option value="">ทุกปี</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className="input w-36"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
        >
          <option value="">ทุกเดือน</option>
          {["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"].map(
            (m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            )
          )}
        </select>
        <select
          className="input w-56"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
        >
          <option value="">ผู้อัปโหลดทั้งหมด</option>
          {users.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        {hasFilter && (
          <button
            className="btn"
            onClick={() => {
              setFilterYear("");
              setFilterMonth("");
              setFilterUser("");
            }}
          >
            ✕ ล้างตัวกรอง
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="table-base w-full min-w-[760px]">
          <thead>
            <tr>
              <th>ผู้อัปโหลด</th>
              <th>ชื่อไฟล์</th>
              <th>ลูกค้า</th>
              <th>ขนาด</th>
              <th>วันที่</th>
              <th>เวลา</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id}>
                <td className="overflow-hidden">
                  {f.uploaded_by ? (
                    <span className="inline-flex items-center">
                      <CopyButton text={f.uploaded_by} />
                      <span className="ml-1 break-all">{f.uploaded_by}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <button className="text-blue-600 underline" onClick={() => download(f)}>
                    {f.file_name}
                  </button>
                </td>
                <td>
                  {f.clients ? (
                    <Link href={`/clients/${f.client_id}`} className="text-blue-600 underline">
                      {f.clients.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap">
                  {f.size_bytes > 1048576
                    ? `${(f.size_bytes / 1048576).toFixed(1)} MB`
                    : `${Math.ceil(f.size_bytes / 1024)} KB`}
                </td>
                <td className="whitespace-nowrap">{fmtDate(f.uploaded_at)}</td>
                <td className="whitespace-nowrap">{fmtTime(f.uploaded_at)}</td>
                <td className="text-right">
                  <button className="btn-danger px-1.5 py-0.5 text-xs" onClick={() => remove(f)}>
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7} className="text-neutral-500">ไม่มีไฟล์</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
