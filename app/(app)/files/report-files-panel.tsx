"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listMonthlyReportFiles,
  type MonthlyReportFileRow,
  type ReportFileKind,
} from "@/lib/actions/files";
import SearchInput from "@/components/search-input";
import EmptyState from "@/components/empty-state";
import { ToastStack, useToasts } from "@/components/toast";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

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

/** "2026-08" -> "สิงหาคม 2569". */
function periodToThai(period: string | null): string {
  if (!period) return "—";
  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return period;
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

const KIND_META: Record<ReportFileKind, { label: string; badge: string }> = {
  report: { label: "รายงาน PDF", badge: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  document: { label: "เอกสารแนบ", badge: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  slip: { label: "สลิป", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  qr: { label: "QR", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
};

function KindBadge({ kind }: { kind: ReportFileKind }) {
  const meta = KIND_META[kind];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.badge}`}
    >
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-neutral-400">—</span>;
  const issued = status === "issued";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        issued ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${issued ? "bg-emerald-500" : "bg-neutral-400"}`} />
      {issued ? "ออกแล้ว" : "ฉบับร่าง"}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

export default function ReportFilesPanel() {
  const [rows, setRows] = useState<MonthlyReportFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterKind, setFilterKind] = useState<"" | ReportFileKind>("");
  const [filterStatus, setFilterStatus] = useState("");
  const { toasts, push, dismiss } = useToasts();

  const load = useCallback(async () => {
    try {
      setRows(await listMonthlyReportFiles());
    } catch {
      push({ type: "error", message: "โหลดไฟล์รายงานไม่สำเร็จ" });
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const clients = useMemo(
    () =>
      [...new Map(rows.filter((r) => r.client_id).map((r) => [r.client_id!, r.client_name ?? "—"])).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "th")),
    [rows]
  );
  const years = useMemo(
    () =>
      [...new Set(rows.map((r) => r.period_label?.slice(0, 4)).filter((y): y is string => !!y))].sort(
        (a, b) => Number(b) - Number(a)
      ),
    [rows]
  );
  const hasFilter =
    filterClient !== "" || filterYear !== "" || filterMonth !== "" || filterKind !== "" || filterStatus !== "";
  const activeFilterCount = [filterClient, filterYear, filterMonth, filterKind, filterStatus].filter(Boolean).length;

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.file_name.toLowerCase().includes(q) &&
          !(r.client_name ?? "").toLowerCase().includes(q) &&
          !(r.report_no ?? "").toLowerCase().includes(q) &&
          !(r.form_code ?? "").toLowerCase().includes(q) &&
          !periodToThai(r.period_label).toLowerCase().includes(q)
        )
          return false;
      }
      if (filterClient && r.client_id !== filterClient) return false;
      if (filterKind && r.kind !== filterKind) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterYear && r.period_label?.slice(0, 4) !== filterYear) return false;
      if (filterMonth && r.period_label?.slice(5, 7) !== filterMonth.padStart(2, "0")) return false;
      return true;
    });
  }, [rows, search, filterClient, filterKind, filterStatus, filterYear, filterMonth]);

  const totalSize = useMemo(() => filtered.reduce((s, r) => s + r.size_bytes, 0), [filtered]);
  const reportCount = useMemo(() => new Set(filtered.map((r) => r.report_id).filter(Boolean)).size, [filtered]);
  const clientCount = useMemo(() => new Set(filtered.map((r) => r.client_id).filter(Boolean)).size, [filtered]);

  function clearFilters() {
    setFilterClient("");
    setFilterYear("");
    setFilterMonth("");
    setFilterKind("");
    setFilterStatus("");
  }

  async function download(row: MonthlyReportFileRow) {
    try {
      const res = await fetch("/api/files/sign-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: row.storage_path }),
      });
      if (!res.ok) throw new Error("sign");
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      push({ type: "error", message: "เปิดไฟล์ไม่สำเร็จ" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="ไฟล์ที่แสดง" value={filtered.length.toLocaleString()} />
        <StatCard label="ขนาดรวม" value={fmtSize(totalSize)} />
        <StatCard label="รอบรายงาน" value={reportCount.toLocaleString()} />
        <StatCard label="ลูกค้า" value={clientCount.toLocaleString()} />
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ค้นหาไฟล์ ลูกค้า เลขที่รายงาน หรือแบบฟอร์ม..."
          />
          {hasFilter && (
            <button type="button" className="btn" onClick={clearFilters}>
              ล้างตัวกรอง
            </button>
          )}
          <span className="ml-auto text-xs text-neutral-500">
            {loading ? "กำลังโหลด..." : `${filtered.length.toLocaleString()} ไฟล์`}
          </span>
        </div>

        <div className="card flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label className="label">ลูกค้า</label>
            <select className="input" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
              <option value="">ลูกค้าทั้งหมด</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="label">ประเภทไฟล์</label>
            <select
              className="input"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as "" | ReportFileKind)}
            >
              <option value="">ทุกประเภท</option>
              <option value="report">รายงาน PDF</option>
              <option value="document">เอกสารแนบ</option>
              <option value="slip">สลิป</option>
              <option value="qr">QR</option>
            </select>
          </div>
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
                <option key={i + 1} value={String(i + 1).padStart(2, "0")}>{m}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="label">สถานะ</label>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">ทุกสถานะ</option>
              <option value="draft">ฉบับร่าง</option>
              <option value="issued">ออกแล้ว</option>
            </select>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500">กำลังกรอง:</span>
            {filterClient && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200"
                onClick={() => setFilterClient("")}
              >
                {clients.find((c) => c.id === filterClient)?.name ?? "ลูกค้า"} <span className="text-neutral-400">×</span>
              </button>
            )}
            {filterKind && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200"
                onClick={() => setFilterKind("")}
              >
                {KIND_META[filterKind].label} <span className="text-neutral-400">×</span>
              </button>
            )}
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
            {filterStatus && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200"
                onClick={() => setFilterStatus("")}
              >
                {filterStatus === "issued" ? "ออกแล้ว" : "ฉบับร่าง"} <span className="text-neutral-400">×</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="table-base w-full min-w-[900px]">
          <thead>
            <tr>
              <th>ไฟล์</th>
              <th className="w-40">ลูกค้า</th>
              <th className="w-56">รอบรายงาน</th>
              <th className="w-28">สถานะ</th>
              <th className="w-32">วันที่</th>
              <th className="w-28"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="py-14 text-center text-sm text-neutral-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="hover:bg-neutral-50">
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-left font-medium text-blue-700 hover:underline"
                        onClick={() => download(r)}
                      >
                        {r.file_name}
                      </button>
                      <KindBadge kind={r.kind} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
                      <span>{fmtSize(r.size_bytes)}</span>
                      {(r.kind === "slip" || r.kind === "qr") && r.form_code && (
                        <>
                          <span className="text-neutral-300">·</span>
                          <span>{r.form_code}</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    {r.client_id ? (
                      <Link href={`/clients/${r.client_id}`} className="text-blue-600 underline">
                        {r.client_name ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td>
                    <div className="font-medium text-neutral-800">{periodToThai(r.period_label)}</div>
                    <div className="text-xs text-neutral-500">
                      {r.label ?? `ครั้งที่ ${r.seq ?? 1}`}
                      {r.report_no ? ` · ${r.report_no}` : ""}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="text-neutral-700">{fmtDate(r.created_at)}</div>
                    <div className="text-xs text-neutral-500">{fmtTime(r.created_at)}</div>
                  </td>
                  <td className="text-right">
                    <button type="button" className="btn px-2 py-1 text-xs" onClick={() => download(r)}>
                      ดาวน์โหลด
                    </button>
                  </td>
                </tr>
              ))}

            {!loading && !filtered.length && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title={search.trim() || hasFilter ? "ไม่พบไฟล์ที่ตรงกับเงื่อนไข" : "ยังไม่มีไฟล์จากรายงาน"}
                    hint={
                      search.trim() || hasFilter
                        ? "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง"
                        : "ไฟล์จะปรากฏที่นี่เมื่อออกรายงานประจำเดือน"
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
