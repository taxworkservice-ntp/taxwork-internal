"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { deleteFileRecord, listFiles, updateFileNote } from "@/lib/actions/files";
import CopyButton from "@/components/copy-button";
import CreatableSelect from "@/components/creatable-select";
import { downloadStoredFile } from "@/lib/download";
import PageHeader from "@/components/page-header";
import SearchInput from "@/components/search-input";
import EmptyState from "@/components/empty-state";
import InlineConfirm from "@/components/inline-confirm";
import UploadZone from "@/components/upload-zone";
import { ToastStack, useToasts } from "@/components/toast";
import ReportFilesPanel from "./report-files-panel";
import WhtFilesPanel from "./wht-files-panel";

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

function fmtSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"general" | "reports" | "wht">("general");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const years = [...new Set(files.map((f) => new Date(f.uploaded_at).getFullYear()))].sort((a, b) => b - a);
  const users = [...new Set(files.map((f) => f.uploaded_by ?? "").filter(Boolean))].sort();
  const noteOptions = useMemo(
    () => [...new Set(files.map((f) => f.note).filter((n): n is string => !!n))].sort(),
    [files]
  );
  const hasFilter = filterYear !== "" || filterMonth !== "" || filterUser !== "";
  const activeFilterCount = [filterYear, filterMonth, filterUser].filter(Boolean).length;

  const load = useCallback(async () => {
    setFiles(await listFiles());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleUploadResult({ ok, failed }: { ok: number; failed: number }) {
    if (ok && failed) push({ type: "info", message: `อัปโหลดสำเร็จ ${ok} ไฟล์ · ล้มเหลว ${failed} ไฟล์` });
    else if (ok) push({ type: "success", message: `อัปโหลดสำเร็จ ${ok} ไฟล์` });
    else if (failed) push({ type: "error", message: `อัปโหลดไม่สำเร็จ ${failed} ไฟล์` });
  }

  function startEditNote(file: FileRow) {
    setExpandedId(file.id);
    setEditingId(file.id);
    setEditNote(file.note ?? "");
  }

  async function saveNote(id: string) {
    setSavingNote(true);
    try {
      await updateFileNote(id, editNote);
      setEditingId(null);
      await load();
      push({ type: "success", message: "บันทึกหมายเหตุแล้ว" });
    } catch {
      push({ type: "error", message: "บันทึกหมายเหตุไม่สำเร็จ" });
    } finally {
      setSavingNote(false);
    }
  }

  async function remove(file: FileRow) {
    setConfirmingId(null);
    try {
      await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: file.storage_path }),
      });
      await deleteFileRecord(file.id);
      setExpandedId(null);
      await load();
      push({ type: "success", message: `ลบ "${file.file_name}" แล้ว` });
    } catch {
      push({ type: "error", message: `ลบ "${file.file_name}" ไม่สำเร็จ` });
    }
  }

  async function download(file: FileRow) {
    try {
      await downloadStoredFile({
        storagePath: file.storage_path,
        fileName: file.file_name,
      });
    } catch {
      push({ type: "error", message: "เปิดไฟล์ไม่สำเร็จ" });
    }
  }

  function clearFilters() {
    setFilterYear("");
    setFilterMonth("");
    setFilterUser("");
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

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="ไฟล์"
        subtitle={
          tab === "general"
            ? "อัปโหลด ค้นหา และจัดการไฟล์ทั้งหมด"
            : tab === "reports"
              ? "ไฟล์ทั้งหมดที่สร้างจากรายงานประจำเดือน"
              : "หนังสือรับรองการหักภาษี ณ ที่จ่ายที่บันทึกจากหน้าหัก ณ ที่จ่าย"
        }
        actions={
          tab === "general" ? (
            <a href="#upload-zone" className="btn-primary inline-flex items-center gap-2 px-4 py-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M8 11V3M5 6l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 13h10" strokeLinecap="round" />
              </svg>
              อัปโหลดไฟล์
            </a>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="mb-4 inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
        {([
          { key: "general", label: "ไฟล์ทั่วไป" },
          { key: "reports", label: "ไฟล์รายงาน" },
          { key: "wht", label: "หัก ณ ที่จ่าย" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <>

      {/* Upload zone */}
      <div id="upload-zone" className="card mb-5 scroll-mt-6">
        <UploadZone
          noteOptions={noteOptions}
          onUploaded={load}
          onResult={handleUploadResult}
        />
      </div>

      {/* Search + filters */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ค้นหาไฟล์ ลูกค้า ผู้ัปโหลด หรือหมายเหตุ..."
          />
          <button
            type="button"
            className={`btn inline-flex items-center gap-2 ${showFilters ? "border-blue-400 text-blue-700" : ""}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 4h12M4 8h8M6.5 12h3" strokeLinecap="round" />
            </svg>
            ตัวกรอง
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="card animate-fade-in flex flex-wrap items-end gap-3">
            <div className="min-w-[120px]">
              <label className="label">ปี</label>
              <select className="input" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                <option value="">ทุกปี</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px]">
              <label className="label">เดือน</label>
              <select className="input" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                <option value="">ทุกเดือน</option>
                {THAI_MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px]">
              <label className="label">ผู้อัปโหลด</label>
              <select className="input" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                <option value="">ผู้อัปโหลดทั้งหมด</option>
                {users.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            {hasFilter && (
              <button type="button" className="btn" onClick={clearFilters}>
                ล้างตัวกรอง
              </button>
            )}
          </div>
        )}

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500">กำลังกรอง:</span>
            {filterYear && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200"
                onClick={() => setFilterYear("")}
              >
                ปี {filterYear} <span className="text-neutral-400">×</span>
              </button>
            )}
            {filterMonth && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200"
                onClick={() => setFilterMonth("")}
              >
                {THAI_MONTHS[Number(filterMonth) - 1]} <span className="text-neutral-400">×</span>
              </button>
            )}
            {filterUser && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200"
                onClick={() => setFilterUser("")}
              >
                {filterUser} <span className="text-neutral-400">×</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* File list */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="table-base w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="w-10"></th>
              <th>ไฟล์</th>
              <th className="w-44">ลูกค้า</th>
              <th className="w-32">วันที่</th>
              <th className="w-64"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="py-14 text-center text-sm text-neutral-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}

            {!loading &&
              grouped.map((g) => {
                const collapsible = g.order >= 2;
                const open = !collapsible || openGroups.has(g.label);
                return (
                  <Fragment key={g.label}>
                    <tr className="bg-neutral-50">
                      <td colSpan={5} className="py-1.5">
                        <button
                          type="button"
                          disabled={!collapsible}
                          onClick={() => collapsible && toggleGroup(g.label)}
                          aria-expanded={collapsible ? open : undefined}
                          className={`inline-flex items-center gap-2 text-xs font-semibold text-neutral-600 ${
                            collapsible ? "cursor-pointer rounded px-1 hover:text-neutral-900" : "cursor-default"
                          }`}
                        >
                          <span className="inline-flex w-3 justify-center text-neutral-400">
                            {collapsible ? <Chevron open={open} /> : null}
                          </span>
                          {g.label}
                          <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                            {g.rows.length}
                          </span>
                        </button>
                      </td>
                    </tr>

                    {open &&
                      g.rows.map((f) => {
                        const expanded = expandedId === f.id;
                        return (
                          <Fragment key={f.id}>
                            <tr className={expanded ? "bg-blue-50/40" : "hover:bg-neutral-50"}>
                              <td className="text-neutral-400">
                                <button
                                  type="button"
                                  aria-label="รายละเอียดไฟล์"
                                  aria-expanded={expanded}
                                  className="rounded p-1 hover:text-neutral-700"
                                  onClick={() => setExpandedId(expanded ? null : f.id)}
                                >
                                  <Chevron open={expanded} />
                                </button>
                              </td>
                              <td className="whitespace-nowrap">
                                <button
                                  type="button"
                                  className="text-left font-medium text-blue-700 hover:underline"
                                  onClick={() => download(f)}
                                >
                                  {f.file_name}
                                </button>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
                                  <span>{fmtSize(f.size_bytes)}</span>
                                  {f.note && (
                                    <>
                                      <span className="text-neutral-300">·</span>
                                      <span className="truncate">หมายเหตุ: {f.note}</span>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td>
                                {f.clients ? (
                                  <Link href={`/clients/${f.client_id}`} className="text-blue-600 underline">
                                    {f.clients.name}
                                  </Link>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap">
                                <div className="text-neutral-700">{fmtDate(f.uploaded_at)}</div>
                                <div className="text-xs text-neutral-500">{fmtTime(f.uploaded_at)}</div>
                              </td>
                              <td className="text-right">
                                {confirmingId === f.id ? (
                                  <InlineConfirm
                                    message="ลบไฟล์นี้?"
                                    confirmLabel="ลบ"
                                    onConfirm={() => remove(f)}
                                    onCancel={() => setConfirmingId(null)}
                                  />
                                ) : (
                                  <span className="inline-flex items-center gap-1.5">
                                    <button type="button" className="btn px-2 py-1 text-xs" onClick={() => download(f)}>
                                      ดาวน์โหลด
                                    </button>
                                    <button
                                      type="button"
                                      className="btn px-2 py-1 text-xs"
                                      onClick={() => startEditNote(f)}
                                    >
                                      หมายเหตุ
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-danger px-2 py-1 text-xs"
                                      onClick={() => setConfirmingId(f.id)}
                                    >
                                      ลบ
                                    </button>
                                  </span>
                                )}
                              </td>
                            </tr>

                            {expanded && (
                              <tr className="bg-neutral-50/70">
                                <td></td>
                                <td colSpan={4} className="pb-4">
                                  <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                                    <div>
                                      <div className="text-xs text-neutral-500">ผู้อัปโหลด</div>
                                      {f.uploaded_by ? (
                                        <span className="inline-flex items-center text-neutral-800">
                                          {f.uploaded_by}
                                          <CopyButton text={f.uploaded_by} />
                                        </span>
                                      ) : (
                                        <span className="text-neutral-400">—</span>
                                      )}
                                    </div>
                                    <div>
                                      <div className="text-xs text-neutral-500">ขนาดไฟล์</div>
                                      <div className="text-neutral-800">{fmtSize(f.size_bytes)}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-neutral-500">เวลาอัปโหลด</div>
                                      <div className="text-neutral-800">
                                        {fmtDate(f.uploaded_at)} {fmtTime(f.uploaded_at)}
                                      </div>
                                    </div>
                                    <div className="sm:col-span-3">
                                      <div className="text-xs text-neutral-500">ที่เก็บไฟล์</div>
                                      <div className="break-all font-mono text-xs text-neutral-500">
                                        {f.storage_path}
                                      </div>
                                    </div>
                                    <div className="sm:col-span-3">
                                      <div className="mb-1 text-xs text-neutral-500">หมายเหตุ</div>
                                      {editingId === f.id ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                          <CreatableSelect
                                            value={editNote}
                                            onChange={setEditNote}
                                            options={noteOptions}
                                            className="w-64"
                                            disabled={savingNote}
                                          />
                                          <button
                                            type="button"
                                            className="btn-primary px-2 py-1 text-xs"
                                            disabled={savingNote}
                                            onClick={() => saveNote(f.id)}
                                          >
                                            บันทึก
                                          </button>
                                          <button
                                            type="button"
                                            className="btn px-2 py-1 text-xs"
                                            disabled={savingNote}
                                            onClick={() => setEditingId(null)}
                                          >
                                            ยกเลิก
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <span>{f.note || <span className="text-neutral-400">—</span>}</span>
                                          <button
                                            type="button"
                                            className="text-xs text-blue-600 underline"
                                            onClick={() => startEditNote(f)}
                                          >
                                            แก้ไข
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}

            {!loading && !grouped.length && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title={search.trim() || hasFilter ? "ไม่พบไฟล์ที่ตรงกับเงื่อนไข" : "ยังไม่มีไฟล์"}
                    hint={
                      search.trim() || hasFilter
                        ? "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง"
                        : "เริ่มต้นด้วยการอัปโหลดไฟล์ด้านบน"
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        </>
      ) : tab === "reports" ? (
        <ReportFilesPanel />
      ) : (
        <WhtFilesPanel />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
