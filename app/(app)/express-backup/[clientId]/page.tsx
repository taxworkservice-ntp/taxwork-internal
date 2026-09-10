"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  cancelBackupJob,
  createManualBackupJob,
  deleteAgentPath,
  deleteBackupJob,
  getExpressBackupDetail,
  saveAgentPath,
  saveExpressBackupConfig,
  setPrimaryAgentPath,
  type AgentPath,
  type BackupDetail,
} from "@/lib/actions/express-backup";
import { STATUS_TH, thaiError, type ExpressBackupStatus } from "@/lib/express-backup-ui";

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
      const d = await getExpressBackupDetail(clientId);
      setDetail(d);
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
          <button className="btn-primary" onClick={handleBackupNow} disabled={busy || !config?.enabled}>
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
      </div>
    </div>
  );
}
