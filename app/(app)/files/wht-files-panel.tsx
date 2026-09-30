"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteFileRecord,
  listWhtFiles,
  type FileRow,
} from "@/lib/actions/files";
import SearchInput from "@/components/search-input";
import EmptyState from "@/components/empty-state";
import InlineConfirm from "@/components/inline-confirm";
import { downloadStoredFile } from "@/lib/download";
import { ToastStack, useToasts } from "@/components/toast";

const pad = (n: number) => String(n).padStart(2, "0");

function fmtSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

export default function WhtFilesPanel() {
  const [rows, setRows] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const load = useCallback(async () => {
    try {
      setRows(await listWhtFiles());
    } catch {
      push({ type: "error", message: "โหลดไฟล์หัก ณ ที่จ่ายไม่สำเร็จ" });
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.file_name.toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q) ||
        (r.uploaded_by ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalSize = useMemo(
    () => filtered.reduce((s, r) => s + r.size_bytes, 0),
    [filtered]
  );

  async function download(row: FileRow) {
    try {
      await downloadStoredFile({
        storagePath: row.storage_path,
        fileName: row.file_name,
      });
    } catch {
      push({ type: "error", message: "เปิดไฟล์ไม่สำเร็จ" });
    }
  }

  async function remove(row: FileRow) {
    setConfirmingId(null);
    try {
      await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: row.storage_path }),
      });
      await deleteFileRecord(row.id);
      await load();
      push({ type: "success", message: `ลบ "${row.file_name}" แล้ว` });
    } catch {
      push({ type: "error", message: `ลบ "${row.file_name}" ไม่สำเร็จ` });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="หนังสือรับรอง" value={filtered.length.toLocaleString()} />
        <StatCard label="ขนาดรวม" value={fmtSize(totalSize)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ค้นหาไฟล์ ผู้จ่าย/ผู้รับ หรือหมายเหตุ..."
        />
        <span className="ml-auto text-xs text-neutral-500">
          {loading ? "กำลังโหลด..." : `${filtered.length.toLocaleString()} รายการ`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="table-base w-full min-w-[720px]">
          <thead>
            <tr>
              <th>ไฟล์</th>
              <th>รายละเอียด</th>
              <th className="w-32">วันที่</th>
              <th className="w-40"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="py-14 text-center text-sm text-neutral-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      className="text-left font-medium text-blue-700 hover:underline"
                      onClick={() => download(r)}
                    >
                      {r.file_name}
                    </button>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {fmtSize(r.size_bytes)}
                    </div>
                  </td>
                  <td className="max-w-72 truncate" title={r.note ?? ""}>
                    {r.note || <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="text-neutral-700">{fmtDate(r.uploaded_at)}</div>
                    <div className="text-xs text-neutral-500">{fmtTime(r.uploaded_at)}</div>
                  </td>
                  <td className="text-right">
                    {confirmingId === r.id ? (
                      <InlineConfirm
                        message="ลบไฟล์นี้?"
                        confirmLabel="ลบ"
                        onConfirm={() => remove(r)}
                        onCancel={() => setConfirmingId(null)}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          className="btn px-2 py-1 text-xs"
                          onClick={() => download(r)}
                        >
                          ดาวน์โหลด
                        </button>
                        <button
                          type="button"
                          className="btn-danger px-2 py-1 text-xs"
                          onClick={() => setConfirmingId(r.id)}
                        >
                          ลบ
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}

            {!loading && !filtered.length && (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    title={search.trim() ? "ไม่พบไฟล์ที่ตรงกับเงื่อนไข" : "ยังไม่มีไฟล์หัก ณ ที่จ่าย"}
                    hint={
                      search.trim()
                        ? "ลองเปลี่ยนคำค้นหา"
                        : "ไฟล์จะปรากฏที่นี่เมื่อดาวน์โหลดหนังสือรับรองจากหน้าหัก ณ ที่จ่าย"
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
