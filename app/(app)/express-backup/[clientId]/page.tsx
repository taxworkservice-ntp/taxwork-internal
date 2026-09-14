"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  approveRestore,
  cancelBackupJob,
  cancelRestore,
  confirmRestore,
  createManualBackupJob,
  deleteAgentPath,
  deleteBackupJob,
  getExpressBackupDetail,
  getRestores,
  rejectRestore,
  requestRestore,
  saveAgentPath,
  saveExpressBackupConfig,
  setPrimaryAgentPath,
  type AgentPath,
  type BackupDetail,
} from "@/lib/actions/express-backup";
import CopyButton from "@/components/copy-button";
import {
  STATUS_TH,
  thaiError,
  type ExpressBackupRestore,
  type ExpressBackupStatus,
} from "@/lib/express-backup-ui";

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`;
}

function formatThaiDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

const TRIGGER_TH: Record<string, string> = { manual: "สั่งเอง", scheduled: "อัตโนมัติ", retry: "ลองใหม่" };

const RESTORE_TH: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว รอเครื่องดาวน์โหลด",
  downloading: "กำลังดาวน์โหลด",
  staged: "เตรียมไฟล์แล้ว รอยืนยัน",
  confirmed: "ยืนยันแล้ว กำลังนำเข้า",
  completed: "เสร็จแล้ว",
  failed: "ล้มเหลว",
  rejected: "ปฏิเสธแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

function StatusBadge({ status }: { status: ExpressBackupStatus }) {
  const cls =
    status === "healthy"
      ? "bg-green-100 text-green-700"
      : status === "failed"
        ? "bg-red-100 text-red-700"
        : status === "late"
          ? "bg-yellow-100 text-yellow-800"
          : status === "running" || status === "pending"
            ? "bg-blue-100 text-blue-700"
            : "bg-neutral-200 text-neutral-600";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {STATUS_TH[status]}
    </span>
  );
}

function JobStatus({ s }: { s: string }) {
  const cls =
    s === "success"
      ? "bg-green-100 text-green-700"
      : s === "failed"
        ? "bg-red-100 text-red-700"
        : s === "cancelled"
          ? "bg-neutral-200 text-neutral-600"
          : "bg-blue-100 text-blue-700";
  const label =
    s === "success"
      ? "สำเร็จ"
      : s === "failed"
        ? "ล้มเหลว"
        : s === "cancelled"
          ? "ยกเลิก"
          : s === "running"
            ? "กำลังสำรอง"
            : "รอดำเนินการ";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

export default function ExpressBackupDetailPage() {
  const params = useParams();
  const clientId = typeof params.clientId === "string" ? params.clientId : "";
  const [detail, setDetail] = useState<BackupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [pathDrafts, setPathDrafts] = useState<Record<string, string>>({});
  const [pathBusy, setPathBusy] = useState<string | null>(null);
  const [exportChecks, setExportChecks] = useState<boolean[]>([]);
  const [restores, setRestores] = useState<ExpressBackupRestore[]>([]);
  const [restoreAgent, setRestoreAgent] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [form, setForm] = useState({
    source_path: "",
    schedule_time: "23:00",
    retention_days: "30",
    enabled: true,
  });

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      const [d, rs] = await Promise.all([
        getExpressBackupDetail(clientId),
        getRestores(clientId),
      ]);
      setDetail(d);
      setRestores(rs);
      const active = d.agents.filter((a) => a.status !== "revoked");
      if (active.length > 0) {
        setRestoreAgent((prev) => prev || active[0].id);
        setRestorePath((prev) => {
          if (prev) return prev;
          const p = d.agent_paths.find((x) => x.agent_id === active[0].id);
          return p ? p.source_path : "";
        });
      }
      const drafts: Record<string, string> = {};
      for (const p of d.agent_paths) drafts[p.agent_id] = p.source_path;
      for (const a of d.agents) {
        if (a.status !== "revoked" && !(a.id in drafts)) drafts[a.id] = "";
      }
      setPathDrafts(drafts);
      if (d.config) {
        setForm({
          source_path: d.config.source_path,
          schedule_time: d.config.schedule_time.slice(0, 5),
          retention_days: String(d.config.retention_days),
          enabled: d.config.enabled,
        });
      } else {
        setEditing(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (window.location.hash === "#export") {
      requestAnimationFrame(() => {
        document.getElementById("export")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [detail]);

  const exportJobId = detail?.latest_success?.id ?? null;
  useEffect(() => {
    if (!exportJobId) {
      setExportChecks([]);
      return;
    }
    try {
      const raw = JSON.parse(localStorage.getItem(`express-backup.export.${exportJobId}`) ?? "[]");
      setExportChecks(Array.isArray(raw) ? raw.map((v) => Boolean(v)) : []);
    } catch {
      setExportChecks([]);
    }
  }, [exportJobId]);
  useEffect(() => {
    if (exportJobId) {
      localStorage.setItem(`express-backup.export.${exportJobId}`, JSON.stringify(exportChecks));
    }
  }, [exportJobId, exportChecks]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await saveExpressBackupConfig(clientId, {
        source_path: form.source_path,
        schedule_time: form.schedule_time,
        retention_days: Number(form.retention_days),
        enabled: form.enabled,
      });
      setMessage("บันทึกการตั้งค่าแล้ว");
      setEditing(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleBackupNow() {
    setBusy(true);
    setMessage("");
    try {
      const r = await createManualBackupJob(clientId);
      setMessage(
        r.ids.length > 1 ? `สร้างงาน ${r.ids.length} งาน รอเครื่องดำเนินการ` : "สร้างงานแล้ว รอเครื่องดำเนินการ"
      );
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "สร้างงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(jobId: string) {
    if (!confirm("ยกเลิกงานนี้?")) return;
    try {
      await cancelBackupJob(jobId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ");
    }
  }

  async function handleSavePath(agentId: string) {
    const path = (pathDrafts[agentId] ?? "").trim();
    if (!path) {
      alert("กรุณาระบุพาธของเครื่องนี้");
      return;
    }
    setPathBusy(agentId);
    try {
      await saveAgentPath(agentId, clientId, path);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "บันทึกพาธไม่สำเร็จ");
    } finally {
      setPathBusy(null);
    }
  }

  async function handleDeletePath(agentId: string, agentName: string) {
    if (!confirm(`ลบพาธของเครื่อง "${agentName}"? เครื่องนี้จะใช้ค่าเริ่มต้นแทน`)) return;
    setPathBusy(agentId);
    try {
      await deleteAgentPath(agentId, clientId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบพาธไม่สำเร็จ");
    } finally {
      setPathBusy(null);
    }
  }

  async function handlePrimary(agentId: string | null) {
    setPathBusy(agentId ?? "primary");
    try {
      await setPrimaryAgentPath(agentId, clientId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ตั้งเครื่องหลักไม่สำเร็จ");
    } finally {
      setPathBusy(null);
    }
  }

  async function handleRequestRestore() {
    const job = detail?.latest_success;
    if (!job) return;
    if (!restoreAgent) {
      alert("กรุณาเลือกเครื่องปลายทาง");
      return;
    }
    if (!restorePath.trim()) {
      alert("กรุณาระบุโฟลเดอร์ปลายทางบนเครื่องนั้น");
      return;
    }
    setRestoreBusy(true);
    try {
      await requestRestore(job.id, restoreAgent, restorePath.trim());
      setMessage("สร้างคำขอส่งออกแล้ว รอการอนุมัติ");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ขอส่งออกไม่สำเร็จ");
    } finally {
      setRestoreBusy(false);
    }
  }

  async function handleRestoreAction(
    id: string,
    action: "approve" | "reject" | "confirm" | "cancel",
    confirmText: string
  ) {
    if (!confirm(confirmText)) return;
    setRestoreBusy(true);
    try {
      if (action === "approve") await approveRestore(id);
      else if (action === "reject") await rejectRestore(id);
      else if (action === "confirm") await confirmRestore(id);
      else await cancelRestore(id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setRestoreBusy(false);
    }
  }

  async function handleDelete(jobId: string) {
    if (!confirm("ลบประวัตินี้ถาวร? ไฟล์สำรองบน R2 จะถูกลบด้วย")) return;
    try {
      await deleteBackupJob(jobId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function handleDownload(jobId: string, fileName: string | null) {
    try {
      const res = await fetch("/api/express-backup/sign-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ขอดาวน์โหลดไม่สำเร็จ");
      const a = document.createElement("a");
      a.href = data.url;
      a.download = fileName ?? "backup.zip";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">กำลังโหลด...</p>;
  if (error || !detail) {
    return (
      <div className="space-y-3">
        <Link href="/express-backup" className="text-sm text-blue-600 hover:underline">
          ← กลับ Express Backup
        </Link>
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{error || "ไม่พบข้อมูล"}</p>
          <button className="btn mt-2" onClick={load}>
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  const { client, config, status, latest_success, jobs, agents, agent_paths } = detail;
  const activeAgents = agents.filter((a) => a.status !== "revoked");
  const pathByAgent: Record<string, AgentPath | undefined> = {};
  for (const p of agent_paths) pathByAgent[p.agent_id] = p;

  return (
    <div className="space-y-4">
      <Link href="/express-backup" className="text-sm text-blue-600 hover:underline">
        ← กลับ Express Backup
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">{client.name}</h1>
        <StatusBadge status={status} />
        <div className="ml-auto flex gap-2">
          <button
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              if (!confirm(`สำรองข้อมูลของ "${client.name}" ตอนนี้?`)) return;
              handleBackupNow();
            }}
            disabled={busy || !config?.enabled}
          >
            {busy ? "…" : "สำรองข้อมูลตอนนี้"}
          </button>
          {config && (
            <button className="btn" onClick={() => setEditing((v) => !v)}>
              {editing ? "ยกเลิก" : "แก้ไขการตั้งค่า"}
            </button>
          )}
        </div>
      </div>

      {message && <p className="text-sm text-green-600">{message}</p>}
      {!config && !editing && <p className="text-sm text-neutral-500">ยังไม่ได้ตั้งค่า Express Backup</p>}

      <div className="card space-y-1 text-sm">
        <p>
          <span className="text-neutral-500">สำรองล่าสุด: </span>
          {formatThaiDateTime(latest_success?.completed_at ?? latest_success?.created_at ?? null)}
          {latest_success?.backup_size_bytes != null && ` · ${formatBytes(latest_success.backup_size_bytes)}`}
        </p>
        <p>
          <span className="text-neutral-500">แหล่งข้อมูล: </span>
          <span className="font-mono text-xs">{config?.source_path ?? "—"}</span>
        </p>
        <p>
          <span className="text-neutral-500">กำหนดเวลา: </span>
          {config ? `ทุกวัน ${config.schedule_time.slice(0, 5)}` : "—"}
        </p>
        <p>
          <span className="text-neutral-500">เก็บข้อมูล: </span>
          {config ? `${config.retention_days} วัน` : "—"}
        </p>
        <p>
          <span className="text-neutral-500">สถานะ: </span>
          {config ? (config.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน") : "—"}
        </p>
      </div>

      {editing && (
        <form className="card grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={handleSave}>
          <label className="label sm:col-span-2">
            แหล่งข้อมูล (พาธบนเครื่อง Windows)
            <input
              className="input font-mono"
              value={form.source_path}
              onChange={(e) => setForm({ ...form, source_path: e.target.value })}
              placeholder="D:\ExpressData\ABC"
              required
            />
          </label>
          <label className="label">
            เวลา (ทุกวัน)
            <input
              className="input"
              type="time"
              value={form.schedule_time}
              onChange={(e) => setForm({ ...form, schedule_time: e.target.value })}
              required
            />
          </label>
          <label className="label">
            เก็บข้อมูล (วัน)
            <input
              className="input"
              type="number"
              min={1}
              value={form.retention_days}
              onChange={(e) => setForm({ ...form, retention_days: e.target.value })}
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            เปิดใช้งาน
          </label>
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={busy}>
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <h2 className="mb-1 font-medium">พาธตามเครื่อง</h2>
        <p className="mb-3 text-xs text-neutral-500">
          ลูกค้านี้อยู่หลายเครื่องและโฟลเดอร์ต่างกัน ให้ระบุพาธของแต่ละเครื่อง
          เครื่องที่ไม่มีพาธจะใช้ค่าเริ่มต้นด้านบน กดสำรองข้อมูลจะสร้างงานให้ทุกเครื่องที่มีพาธ
        </p>
        {agent_paths.length > 1 &&
          (() => {
            const home = agent_paths.find((p) => p.is_primary);
            const homeName = home
              ? activeAgents.find((a) => a.id === home.agent_id)?.agent_name ?? home.agent_id
              : null;
            return (
              <div className="mb-3 rounded border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800">
                บริษัทนี้มีข้อมูลบน {agent_paths.length} เครื่อง
                {homeName ? (
                  <> — เครื่องหลักคือ <span className="font-medium">🏠 {homeName}</span> ใช้อ้างอิงตอนรับข้อมูล</>
                ) : (
                  <> — ยังไม่ได้ตั้งเครื่องหลัก กรุณากด “ตั้งเป็นหลัก” ที่เครื่องตัวจริง</>
                )}
              </div>
            );
          })()}
        {activeAgents.length === 0 ? (
          <p className="text-sm text-neutral-500">ยังไม่มีเครื่อง เพิ่มเครื่องที่หน้า Express Backup ก่อน</p>
        ) : (
          <div className="space-y-3">
            {activeAgents.map((a) => {
              const saved = pathByAgent[a.id];
              return (
                <div key={a.id} className="grid grid-cols-1 gap-2 border-t pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1 text-sm">
                      <span className="truncate font-medium">{a.agent_name}</span>
                      <span className="truncate text-xs text-neutral-500">({a.machine_name})</span>
                      {saved?.is_primary && (
                        <span className="inline-flex shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                          ★ หลัก
                        </span>
                      )}
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-1">
                      <input
                        className="input min-w-0 flex-1 font-mono"
                        value={pathDrafts[a.id] ?? ""}
                        onChange={(e) => setPathDrafts({ ...pathDrafts, [a.id]: e.target.value })}
                        placeholder="D:\ExpressData\ABC"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      className="btn px-2 py-1 text-xs"
                      disabled={pathBusy === a.id}
                      onClick={() => handleSavePath(a.id)}
                    >
                      {pathBusy === a.id ? "…" : "บันทึก"}
                    </button>
                    {saved && (
                      <>
                        <button
                          className="btn px-2 py-1 text-xs"
                          disabled={pathBusy !== null}
                          title="เครื่องหลักคือต้นฉบับความจริงไว้ใช้อ้างอิงตอนกู้คืน"
                          onClick={() => handlePrimary(saved.is_primary ? null : a.id)}
                        >
                          {saved.is_primary ? "เลิกเป็นหลัก" : "ตั้งเป็นหลัก"}
                        </button>
                        <button
                          className="btn-danger px-2 py-1 text-xs"
                          disabled={pathBusy === a.id}
                          onClick={() => handleDeletePath(a.id, a.agent_name)}
                        >
                          ลบ
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {latest_success && (
        <div id="export" className="card scroll-mt-20 border-blue-200 ring-1 ring-blue-100">
          <h2 className="mb-1 font-medium">ย้ายข้อมูลไปเครื่องอื่น — ทำ 3 ขั้น</h2>
          <p className="mb-3 text-sm text-neutral-600">
            ใช้ข้อมูลสำรองล่าสุด {formatThaiDateTime(latest_success.completed_at ?? latest_success.created_at)} ·{" "}
            {formatBytes(latest_success.backup_size_bytes)}
            {latest_success.source_file_count != null && ` · ${latest_success.source_file_count} ไฟล์`} · จาก{" "}
            {latest_success.agent_name ?? "—"}
          </p>
          <div className="mb-3 rounded bg-green-50 border border-green-200 p-2 text-xs text-green-800">
            ปลอดภัย: โปรแกรมจะเก็บของเดิมไว้ให้ก่อนเสมอ (โฟลเดอร์ .bak) ถ้าผิดพลาดยังเอากลับได้
          </div>
          <ol className="mb-3 flex gap-2 text-xs">
            <li className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800">1 เลือกเครื่อง</li>
            <li className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">2 เตรียมไฟล์</li>
            <li className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">3 ยืนยันนำเข้า</li>
          </ol>
          <details className="mb-3 text-xs text-neutral-500">
            <summary className="cursor-pointer hover:underline">วิธีขั้นสูงสำหรับเจ้าหน้าที่ (ดาวน์โหลดเอง / ตรวจ SHA)</summary>
            <div className="mt-2 space-y-1 text-sm">
              <p>
                <span className="text-neutral-500">ไฟล์: </span>
                <span className="font-mono text-xs">{latest_success.file_name ?? "—"}</span>
                <button
                  className="btn ml-2 px-2 py-1 text-xs"
                  onClick={() => handleDownload(latest_success.id, latest_success.file_name)}
                >
                  ดาวน์โหลด
                </button>
              </p>
              {latest_success.checksum && (
                <p className="flex min-w-0 items-center gap-1">
                  <span className="shrink-0 text-neutral-500">รหัสตรวจไฟล์: </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{latest_success.checksum}</span>
                  <CopyButton text={latest_success.checksum} />
                </p>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {[
                "ดาวน์โหลดไฟล์แล้ว",
                `ตรวจรหัสตรงกันแล้ว (รัน certutil -hashfile "${latest_success.file_name ?? "backup.zip"}" SHA256)`,
                "แตกไฟล์ดูข้างในก่อน อย่าทับของจริง",
                "เก็บโฟลเดอร์เดิมไว้ที่ *.bak ก่อนเสมอ",
                "คัดลอกไฟล์เข้าที่แล้ว",
                "เปิด Express ตรวจบริษัทเรียบร้อย",
              ].map((s, i) => (
                <label key={i} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(exportChecks[i])}
                    onChange={() =>
                      setExportChecks((prev) => {
                        const next = [...prev];
                        next[i] = !next[i];
                        return next;
                      })
                    }
                  />
                  <span className={exportChecks[i] ? "text-neutral-400 line-through" : ""}>
                    {i + 1}. {s}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span>เสร็จ {exportChecks.filter(Boolean).length}/6</span>
              <button className="btn px-2 py-1 text-xs" onClick={() => setExportChecks([])}>
                เริ่มใหม่
              </button>
            </div>
          </details>

          <div className="mt-2 border-t pt-3">
            <p className="mb-1 text-sm font-medium">ขั้นที่ 1 — เลือกเครื่องที่จะรับข้อมูล</p>
            <p className="mb-2 text-xs text-neutral-500">
              เครื่องจะเตรียมไฟล์ให้เอง คุณแค่กดอนุมัติ 2 ครั้ง ไฟล์จริงจะเข้าที่ก็ต่อเมื่อคุณยืนยันแล้วเท่านั้น
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="label">
                เครื่องปลายทาง
                <select
                  className="input"
                  value={restoreAgent}
                  onChange={(e) => {
                    const id = e.target.value;
                    setRestoreAgent(id);
                    const p = agent_paths.find((x) => x.agent_id === id);
                    if (p) setRestorePath(p.source_path);
                  }}
                >
                  {activeAgents.length === 0 && <option value="">ยังไม่มีเครื่อง</option>}
                  {activeAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.agent_name} ({a.machine_name})
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                โฟลเดอร์ปลายทางบนเครื่องนั้น
                <input
                  className="input font-mono"
                  value={restorePath}
                  onChange={(e) => setRestorePath(e.target.value)}
                  placeholder="D:\ExpressData\ABC"
                />
              </label>
              <div className="flex items-end">
                <button
                  className="btn-primary px-3 py-2 text-sm"
                  disabled={restoreBusy || !restoreAgent}
                  onClick={handleRequestRestore}
                >
                  {restoreBusy ? "…" : "1. ส่งข้อมูลไปเครื่องนี้"}
                </button>
              </div>
            </div>

            {restores.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium">ขั้นที่ 2-3 — ติดตามและกดยืนยัน</p>
                {restores.map((r) => (
                  <div key={r.id} className="rounded border p-2 text-sm">
                    <p className="flex min-w-0 flex-wrap items-center gap-1">
                      <span className="font-medium">{RESTORE_TH[r.status] ?? r.status}</span>
                      <span className="text-neutral-500">→ {r.target_agent_name ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={r.target_path}>
                        {r.target_path}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {r.status === "pending" && "ขั้นที่ 2: กดปุ่มสีน้ำเงินให้เครื่องเริ่มเตรียมไฟล์ (ยังไม่แตะของจริง)"}
                      {r.status === "approved" && "เครื่องกำลังเตรียมไฟล์ รอสักครู่แล้วกดรีเฟรช"}
                      {r.status === "downloading" && "เครื่องกำลังโหลดไฟล์ รอสักครู่"}
                      {r.status === "staged" && `ขั้นที่ 3: เครื่องเตรียมแล้ว ${r.staged_file_count ?? ""} ไฟล์ ตรวจแล้วกดปุ่มแดง ของเดิมจะถูกเก็บไว้ให้ก่อน`}
                      {r.status === "confirmed" && "เครื่องกำลังย้ายไฟล์เข้า รอสักครู่"}
                      {r.status === "completed" && "เสร็จแล้ว เปิด Express ที่เครื่องปลายทางตรวจดูได้เลย"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      ขอโดย {r.requested_by ?? "—"}
                      {r.approved_by && ` · อนุมัติโดย ${r.approved_by}`}
                      {r.confirmed_by && ` · ยืนยันโดย ${r.confirmed_by}`}
                      {r.staged_file_count != null && ` · เตรียมแล้ว ${r.staged_file_count} ไฟล์`}
                      {r.bak_path && (
                        <span title={r.bak_path}> · ของเดิมเก็บไว้ที่ {r.bak_path} (เอากลับได้)</span>
                      )}
                    </p>
                    {r.error_code && (
                      <p className="mt-1 text-red-600">
                        {thaiError(r.error_code)} ({r.error_code})
                        {r.error_message && ` — ${r.error_message}`}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.status === "pending" && (
                        <>
                          <button
                            className="btn-primary px-3 py-1.5 text-sm"
                            disabled={restoreBusy}
                            onClick={() =>
                              handleRestoreAction(
                                r.id,
                                "approve",
                                `ขั้นที่ 2: ให้เครื่อง ${r.target_agent_name ?? ""} เตรียมไฟล์ ${r.job_file_name ?? ""} ไว้ก่อน?\nยังไม่แตะของจริง ของเดิมยังอยู่ครบ`
                              )
                            }
                          >
                            2. ให้เครื่องเตรียมไฟล์
                          </button>
                          <button
                            className="btn px-2 py-1 text-xs"
                            disabled={restoreBusy}
                            onClick={() =>
                              handleRestoreAction(r.id, "reject", "ไม่ต้องการย้ายข้อมูลนี้แล้วใช่ไหม?")
                            }
                          >
                            ไม่เอา
                          </button>
                        </>
                      )}
                      {r.status === "staged" && (
                        <button
                          className="btn-danger px-3 py-1.5 text-sm"
                          disabled={restoreBusy}
                          onClick={() =>
                            handleRestoreAction(
                              r.id,
                              "confirm",
                              `ขั้นที่ 3 สุดท้าย: ย้ายไฟล์เข้าที่ ${r.target_path}?\nเครื่องจะเก็บของเดิมไว้เป็น .bak ให้ก่อน ถ้าผิดยังเอากลับได้`
                            )
                          }
                        >
                          3. ยืนยันย้ายไฟล์เข้า
                        </button>
                      )}
                      {["pending", "approved", "staged"].includes(r.status) && (
                        <button
                          className="btn px-2 py-1 text-xs"
                          disabled={restoreBusy}
                          onClick={() =>
                            handleRestoreAction(r.id, "cancel", "ยกเลิกคำขอนี้?")
                          }
                        >
                          ยกเลิก
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 font-medium">ประวัติการสำรองข้อมูล ({jobs.length})</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-neutral-500">ยังไม่มีประวัติการสำรองข้อมูล</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base w-full min-w-[720px]">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ขนาด</th>
                  <th>สถานะ</th>
                  <th>ประเภท</th>
                  <th>ไฟล์</th>
                  <th>การทำงาน</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <Fragment key={j.id}>
                    <tr>
                      <td className="whitespace-nowrap">{formatThaiDateTime(j.created_at)}</td>
                      <td className="whitespace-nowrap">{formatBytes(j.backup_size_bytes)}</td>
                      <td>
                        <JobStatus s={j.status} />
                      </td>
                      <td>{TRIGGER_TH[j.trigger_type] ?? j.trigger_type}</td>
                      <td className="max-w-[220px] truncate font-mono text-xs" title={j.file_name ?? ""}>
                        {j.file_name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap">
                        {j.status === "success" && (
                          <button
                            className="btn px-2 py-1 text-xs"
                            onClick={() => handleDownload(j.id, j.file_name)}
                          >
                            ดาวน์โหลด
                          </button>
                        )}{" "}
                        {(j.status === "pending" || j.status === "running") && (
                          <button
                            className="btn-danger px-2 py-1 text-xs"
                            onClick={() => handleCancel(j.id)}
                          >
                            ยกเลิก
                          </button>
                        )}{" "}
                        {(j.status === "success" ||
                          j.status === "failed" ||
                          j.status === "cancelled") && (
                          <button
                            className="btn-danger px-2 py-1 text-xs"
                            onClick={() => handleDelete(j.id)}
                          >
                            ลบ
                          </button>
                        )}{" "}
                        <button
                          className="btn px-2 py-1 text-xs"
                          onClick={() => setExpandedJob(expandedJob === j.id ? null : j.id)}
                        >
                          รายละเอียด
                        </button>
                      </td>
                    </tr>
                    {expandedJob === j.id && (
                      <tr>
                        <td colSpan={6} className="bg-neutral-50 text-xs">
                          <div className="space-y-1">
                            <p>
                              <span className="text-neutral-500">เริ่ม:</span>{" "}
                              {formatThaiDateTime(j.started_at)}{" "}
                              <span className="text-neutral-500">เสร็จ:</span>{" "}
                              {formatThaiDateTime(j.completed_at)}
                            </p>
                            {j.agent_name && (
                              <p>
                                <span className="text-neutral-500">เครื่อง:</span> {j.agent_name}
                              </p>
                            )}
                            {j.target_agent_name && j.target_agent_name !== j.agent_name && (
                              <p>
                                <span className="text-neutral-500">เครื่องเป้าหมาย:</span>{" "}
                                {j.target_agent_name}
                              </p>
                            )}
                            {j.source_path_used && (
                              <p className="break-all">
                                <span className="text-neutral-500">โฟลเดอร์ที่ใช้:</span>{" "}
                                <span className="font-mono">{j.source_path_used}</span>
                              </p>
                            )}
                            {j.checksum && (
                              <p className="break-all">
                                <span className="text-neutral-500">SHA-256:</span>{" "}
                                <span className="font-mono">{j.checksum}</span>
                              </p>
                            )}
                            {j.source_size_bytes != null && (
                              <p>
                                <span className="text-neutral-500">ขนาดต้นฉบับ:</span>{" "}
                                {formatBytes(j.source_size_bytes)}
                                {j.source_file_count != null && ` (${j.source_file_count} ไฟล์)`}
                              </p>
                            )}
                            {j.error_code && (
                              <p className="text-red-600">
                                {thaiError(j.error_code)} ({j.error_code})
                                {j.error_message && ` — ${j.error_message}`}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-2 font-medium">ประวัติการย้ายข้อมูลไปเครื่องอื่น ({restores.length})</h3>
          {restores.length === 0 ? (
            <p className="text-sm text-neutral-500">ยังไม่มีการย้ายข้อมูล</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base w-full min-w-[720px]">
                <thead>
                  <tr>
                    <th>วันที่ขอ</th>
                    <th>ไฟล์ต้นฉบับ</th>
                    <th>ไปเครื่อง</th>
                    <th>สถานะ</th>
                    <th>ของเดิม (.bak)</th>
                  </tr>
                </thead>
                <tbody>
                  {restores.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{formatThaiDateTime(r.created_at)}</td>
                      <td className="max-w-[200px] truncate font-mono text-xs" title={r.job_file_name ?? ""}>
                        {r.job_file_name ?? "—"}
                      </td>
                      <td>
                        <span className="font-medium">{r.target_agent_name ?? "—"}</span>
                        <div className="max-w-[200px] truncate font-mono text-xs text-neutral-500" title={r.target_path}>
                          {r.target_path}
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                          {RESTORE_TH[r.status] ?? r.status}
                        </span>
                        {r.error_code && (
                          <div className="text-xs text-red-600">
                            {thaiError(r.error_code)} ({r.error_code})
                          </div>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate font-mono text-xs" title={r.bak_path ?? ""}>
                        {r.bak_path ?? (r.status === "completed" ? "—" : "ยังไม่ย้ายไฟล์เข้า")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
