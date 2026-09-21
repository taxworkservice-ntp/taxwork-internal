"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { deleteFileRecord, listFiles, recordFile, updateFileNote } from "@/lib/actions/files";
import CopyButton from "@/components/copy-button";
import CreatableSelect from "@/components/creatable-select";

type FileRow = {
  id: string;
  client_id: string | null;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
  note: string | null;
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

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getFileGroup(iso: string, now = new Date()): { label: string; order: number } {
  const d = new Date(iso);
  const diff = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000);
  if (diff <= 0) return { label: "วันนี้", order: 0 };
  if (diff === 1) return { label: "เมื่อวาน", order: 1 };
  if (diff <= 7) return { label: "7 วันที่ผ่านมา", order: 2 };
  if (diff <= 30) return { label: "30 วันที่ผ่านมา", order: 3 };
  const label = `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const order = 100000 - (d.getFullYear() * 12 + d.getMonth());
  return { label, order };
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const years = [...new Set(files.map((f) => new Date(f.uploaded_at).getFullYear()))].sort((a, b) => b - a);
  const users = [...new Set(files.map((f) => f.uploaded_by ?? "").filter(Boolean))].sort();
  const noteOptions = useMemo(
    () => [...new Set(files.map((f) => f.note).filter((n): n is string => !!n))].sort(),
    [files]
  );
  const hasFilter = filterYear !== "" || filterMonth !== "" || filterUser !== "";

  const load = useCallback(async () => {
    setFiles(await listFiles());
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const file of arr) {
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
        await recordFile({
          client_id: null,
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type,
          note: note || null,
        });
      }
    } finally {
      setUploading(false);
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      load();
    }
  }

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) uploadFiles(e.target.files);
  }

  function startEditNote(file: FileRow) {
    setEditingId(file.id);
    setEditNote(file.note ?? "");
  }

  async function saveNote(id: string) {
    setSavingNote(true);
    try {
      await updateFileNote(id, editNote);
      setEditingId(null);
      await load();
    } finally {
      setSavingNote(false);
    }
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
        !(f.note ?? "").toLowerCase().includes(q) &&
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

  const grouped = useMemo(() => {
    const now = new Date();
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );
    const map = new Map<string, { label: string; order: number; rows: FileRow[] }>();
    for (const f of sorted) {
      const g = getFileGroup(f.uploaded_at, now);
      const entry = map.get(g.label);
      if (entry) entry.rows.push(f);
      else map.set(g.label, { ...g, rows: [f] });
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [filtered]);

  // All date groups are shown inline by default; older groups (older than
  // yesterday) can be collapsed and expanded individually by clicking their
  // header row.
  function toggleGroup(label: string) {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">ไฟล์</h1>
      </div>

      <div className="mb-3 max-w-sm">
        <label className="label">หมายเหตุ (ใช้กับไฟล์ที่อัปโหลดชุดนี้)</label>
        <CreatableSelect
          value={note}
          onChange={setNote}
          options={noteOptions}
          placeholder="เลือกหรือพิมพ์หมายเหตุใหม่..."
          disabled={uploading}
        />
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
        className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? "border-blue-500 bg-blue-50" : "border-neutral-300 bg-neutral-50 hover:border-neutral-400"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="text-sm font-medium text-neutral-700">
          {uploading ? "กำลังอัปโหลด..." : dragging ? "วางไฟล์เพื่ออัปโหลด" : "ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์"}
        </p>
        <p className="text-xs text-neutral-500">รองรับหลายไฟล์พร้อมกัน</p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={upload} disabled={uploading} />
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
              <th>หมายเหตุ</th>
              <th>ขนาด</th>
              <th>วันที่</th>
              <th>เวลา</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => {
              const collapsible = g.order >= 2;
              const open = !collapsible || !closedGroups.has(g.label);
              return (
              <Fragment key={`group-${g.label}`}>
                <tr
                  className={`bg-neutral-100 ${collapsible ? "cursor-pointer hover:bg-neutral-200" : ""}`}
                  onClick={collapsible ? () => toggleGroup(g.label) : undefined}
                >
                  <td colSpan={8} className="py-1.5 text-xs font-semibold text-neutral-600">
                    {collapsible && (
                      <span className="mr-1 inline-block w-3 text-neutral-400">{open ? "▼" : "▶"}</span>
                    )}
                    {g.label} <span className="ml-1 font-normal text-neutral-400">({g.rows.length})</span>
                  </td>
                </tr>
                {open && g.rows.map((f) => (
                  <tr key={f.id}>
                    <td className="overflow-hidden">
                      {f.uploaded_by ? (
                        <span className="inline-flex items-center">
                          <CopyButton text={f.uploaded_by} />
                          <span className="ml-1 truncate">{f.uploaded_by}</span>
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
                    <td className="min-w-[200px]">
                      {editingId === f.id ? (
                        <div className="flex items-center gap-1">
                          <CreatableSelect
                            value={editNote}
                            onChange={setEditNote}
                            options={noteOptions}
                            className="w-48"
                            disabled={savingNote}
                          />
                          <button
                            className="btn-primary px-1.5 py-0.5 text-xs"
                            disabled={savingNote}
                            onClick={() => saveNote(f.id)}
                          >
                            บันทึก
                          </button>
                          <button
                            className="btn px-1.5 py-0.5 text-xs"
                            disabled={savingNote}
                            onClick={() => setEditingId(null)}
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 truncate">{f.note || "—"}</span>
                          <button
                            className="shrink-0 text-xs text-blue-600 underline"
                            onClick={() => startEditNote(f)}
                          >
                            แก้ไข
                          </button>
                        </div>
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
              </Fragment>
              );
            })}
            {!grouped.length && (
              <tr>
                <td colSpan={8} className="text-neutral-500">ไม่มีไฟล์</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
