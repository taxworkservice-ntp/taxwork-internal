"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CopyButton from "@/components/copy-button";
import {
  createBackupAllJobs,
  createManualBackupJob,
  getAgents,
  getBackupStorageStats,
  getExpressBackupOverview,
  registerAgent,
  revokeAgent,
  type OverviewRow,
} from "@/lib/actions/express-backup";
import { STATUS_TH, type ExpressBackupStatus } from "@/lib/express-backup-ui";

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
  const dot = status === "healthy" ? "✓ " : status === "failed" ? "✕ " : status === "late" ? "⚠ " : "";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {dot}
      {STATUS_TH[status]}
    </span>
  );
}

type Agent = {
  id: string;
  agent_name: string;
  machine_name: string;
  status: string;
  version: string | null;
  last_seen_at: string | null;
};

export default function ExpressBackupPage() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsOnline, setAgentsOnline] = useState(0);
  const [stats, setStats] = useState<{ total_files: number; total_bytes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentForm, setAgentForm] = useState({ agent_name: "", machine_name: "" });
  const [newToken, setNewToken] = useState<{ id: string; token: string } | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("express-backup.favorites") ?? "[]");
    } catch {
      return [];
    }
  });
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("express-backup.hidden") ?? "[]");
    } catch {
      return [];
    }
  });
  const [onlyFav, setOnlyFav] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    localStorage.setItem("express-backup.favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem("express-backup.hidden", JSON.stringify(hidden));
  }, [hidden]);

  function toggleFav(clientId: string) {
    setFavorites((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  }

  function toggleHide(clientId: string) {
    setHidden((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overview, agentList, storage] = await Promise.all([
        getExpressBackupOverview(),
        getAgents(),
        getBackupStorageStats(),
      ]);
      setRows(overview.rows);
      setAgentsOnline(overview.agentsOnline);
      setAgents(agentList);
      setStats({ total_files: storage.total_files, total_bytes: storage.total_bytes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleBackupAll() {
    if (!confirm("สร้างงานสำรองข้อมูลให้ลูกค้าที่เปิดใช้งานทั้งหมด?")) return;
    setBusy("all");
    setMessage("");
    try {
      const r = await createBackupAllJobs();
      setMessage(`สร้างงาน ${r.created} งาน${r.skipped > 0 ? ` (ข้าม ${r.skipped} ที่มีงานรออยู่)` : ""}`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "สร้างงานไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function handleBackupOne(clientId: string) {
    setBusy(clientId);
    setMessage("");
    try {
      await createManualBackupJob(clientId);
      setMessage("สร้างงานแล้ว รอเครื่องดำเนินการ");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "สร้างงานไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function handleRegisterAgent(e: React.FormEvent) {
    e.preventDefault();
    setBusy("agent");
    try {
      const r = await registerAgent(agentForm);
      setNewToken({ id: r.id, token: r.registration_token });
      setAgentForm({ agent_name: "", machine_name: "" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "เพิ่มเครื่องไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(agentId: string, name: string) {
    if (!confirm(`เพิกถอนเครื่อง "${name}"? เครื่องจะใช้งานต่อไม่ได้ทันที`)) return;
    try {
      await revokeAgent(agentId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "เพิกถอนไม่สำเร็จ");
    }
  }

  const q = search.trim().toLowerCase();
  const searched = q
    ? rows.filter(
        (r) => r.client_name.toLowerCase().includes(q) || (r.tax_id ?? "").includes(q)
      )
    : rows;
  const hiddenCount = searched.filter((r) => hidden.includes(r.client_id)).length;
  const filtered = searched
    .filter((r) => (showHidden ? true : !hidden.includes(r.client_id)))
    .filter((r) => (onlyFav ? favorites.includes(r.client_id) : true))
    .sort((a, b) => {
      const fa = favorites.includes(a.client_id) ? 0 : 1;
      const fb = favorites.includes(b.client_id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.client_name.localeCompare(b.client_name, "th");
    });
  const healthy = rows.filter((r) => r.status === "healthy").length;
  const problems = rows.filter((r) => r.status === "failed" || r.status === "late").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">Express Backup</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-primary" onClick={handleBackupAll} disabled={busy !== null || loading}>
            {busy === "all" ? "กำลังสร้าง..." : "สำรองข้อมูลทั้งหมด"}
          </button>
          <button className="btn" onClick={() => setShowAgentForm((v) => !v)}>
            {showAgentForm ? "ยกเลิก" : "เพิ่มเครื่อง"}
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
          <button className="btn mt-2" onClick={load}>
            ลองใหม่
          </button>
        </div>
      )}

      {showAgentForm && (
        <form className="card grid max-w-xl grid-cols-2 gap-3" onSubmit={handleRegisterAgent}>
          <label className="label">
            ชื่อเครื่อง
            <input
              className="input"
              value={agentForm.agent_name}
              onChange={(e) => setAgentForm({ ...agentForm, agent_name: e.target.value })}
              placeholder="เช่น OFFICE-PC"
              required
            />
          </label>
          <label className="label">
            ชื่อคอมพิวเตอร์
            <input
              className="input"
              value={agentForm.machine_name}
              onChange={(e) => setAgentForm({ ...agentForm, machine_name: e.target.value })}
              placeholder="เช่น DESKTOP-ABC"
              required
            />
          </label>
          <div className="col-span-2">
            <button className="btn-primary" disabled={busy === "agent"}>
              {busy === "agent" ? "กำลังเพิ่ม..." : "เพิ่มเครื่อง"}
            </button>
          </div>
        </form>
      )}

      {newToken && (
        <div className="card space-y-2 border-yellow-300 bg-yellow-50">
          <p className="text-sm font-medium">ลงทะเบียนเครื่องสำเร็จ (รหัสแสดงครั้งเดียว):</p>
          <p className="text-xs text-neutral-600">
            รหัสเครื่อง (agent ID)
            <span className="ml-1 inline-flex min-w-0 items-center gap-1 align-middle">
              <span className="inline-block max-w-[280px] truncate font-mono text-xs sm:max-w-[360px]">
                {newToken.id}
              </span>
              <CopyButton text={newToken.id} />
            </span>
          </p>
          <p className="text-xs text-neutral-600">
            รหัสลงทะเบียน
            <span className="ml-1 inline-flex min-w-0 items-center gap-1 align-middle">
              <span className="inline-block max-w-[280px] truncate font-mono text-xl font-bold tracking-widest sm:max-w-[360px]">
                {newToken.token}
              </span>
              <CopyButton text={newToken.token} />
            </span>
          </p>
          <p className="text-xs text-neutral-600">
            ใส่ทั้งสองค่านี้ใน config.json แล้วรัน python main.py --register บนเครื่อง Windows
            หลังจากนั้นรหัสลงทะเบียนจะใช้ไม่ได้อีก
          </p>
          <button className="btn mt-2" onClick={() => setNewToken(null)}>
            ปิด
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="card">บริษัททั้งหมด: {loading ? "…" : rows.length}</div>
        <div className="card">สำรองปกติ: {loading ? "…" : healthy}</div>
        <div className={`card ${problems > 0 ? "text-red-600" : ""}`}>
          มีปัญหา: {loading ? "…" : problems}
        </div>
        <div className="card">เครื่องออนไลน์: {loading ? "…" : `${agentsOnline}/${agents.length}`}</div>
        <div className="card">
          พื้นที่จัดเก็บ: {stats ? `${stats.total_files} ไฟล์ · ${formatBytes(stats.total_bytes)}` : "…"}
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="ค้นหาบริษัท..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className={onlyFav ? "btn-primary px-2 py-1 text-xs" : "btn px-2 py-1 text-xs"}
            onClick={() => setOnlyFav((v) => !v)}
            title="แสดงเฉพาะบริษัทที่ติดดาว"
          >
            ★ รายการโปรด
          </button>
          <button
            className={showHidden ? "btn-primary px-2 py-1 text-xs" : "btn px-2 py-1 text-xs"}
            onClick={() => setShowHidden((v) => !v)}
            title="แสดงบริษัทที่ซ่อนอยู่"
          >
            {showHidden ? "ซ่อนรายการที่ซ่อนอยู่" : `แสดงที่ซ่อนอยู่ (${hiddenCount})`}
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-neutral-500">กำลังโหลด...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {rows.length === 0
              ? "ยังไม่มีข้อมูลลูกค้า"
              : onlyFav
                ? "ยังไม่มีรายการโปรด — กด ★ ที่บริษัทที่สำรองบ่อย"
                : "ไม่พบลูกค้าที่ค้นหา"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base w-full min-w-[720px]">
              <thead>
                <tr>
                  <th>บริษัท</th>
                  <th>สำรองล่าสุด</th>
                  <th>สถานะ</th>
                  <th>ขนาด</th>
                  <th>การทำงาน</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.client_id} className={hidden.includes(r.client_id) ? "opacity-60" : ""}>
                    <td>
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          className={
                            favorites.includes(r.client_id)
                              ? "shrink-0 text-lg leading-none text-yellow-500"
                              : "shrink-0 text-lg leading-none text-neutral-300 hover:text-yellow-500"
                          }
                          onClick={() => toggleFav(r.client_id)}
                          title={
                            favorites.includes(r.client_id)
                              ? "เอาออกจากรายการโปรด"
                              : "ติดดาวเป็นรายการโปรด"
                          }
                        >
                          ★
                        </button>
                        <div className="min-w-0">
                          <Link
                            href={`/express-backup/${r.client_id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {r.client_name}
                          </Link>
                          {r.tax_id && <div className="text-xs text-neutral-500">{r.tax_id}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{formatThaiDateTime(r.latest_success_at)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.latest_job_status === "failed" && (
                        <div className="text-xs text-red-500">งานล่าสุดล้มเหลว</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{formatBytes(r.latest_success_size)}</td>
                    <td className="whitespace-nowrap">
                      <Link href={`/express-backup/${r.client_id}`} className="btn px-2 py-1 text-xs">
                        เปิด
                      </Link>{" "}
                      <button
                        className="btn px-2 py-1 text-xs"
                        disabled={busy !== null || !r.has_config || !r.enabled}
                        title={!r.has_config ? "ยังไม่ได้ตั้งค่า" : "สำรองข้อมูลตอนนี้"}
                        onClick={() => handleBackupOne(r.client_id)}
                      >
                        {busy === r.client_id ? "…" : "สำรองตอนนี้"}
                      </button>{" "}
                      <button
                        className="btn px-2 py-1 text-xs"
                        onClick={() => toggleHide(r.client_id)}
                        title={
                          hidden.includes(r.client_id)
                            ? "เลิกซ่อนบริษัทนี้"
                            : "ซ่อนบริษัทนี้จากรายการ (สำรองนานๆ ครั้ง)"
                        }
                      >
                        {hidden.includes(r.client_id) ? "เลิกซ่อน" : "ซ่อน"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 font-medium">เครื่องสำรองข้อมูล ({agents.length})</h2>
        {agents.length === 0 ? (
          <p className="text-sm text-neutral-500">ยังไม่มีเครื่อง กด “เพิ่มเครื่อง” เพื่อลงทะเบียน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base w-full min-w-[560px]">
              <thead>
                <tr>
                  <th>เครื่อง</th>
                  <th>เวอร์ชัน</th>
                  <th>เห็นล่าสุด</th>
                  <th>สถานะ</th>
                  <th>การทำงาน</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="font-medium">{a.agent_name}</span>
                      <div className="text-xs text-neutral-500">{a.machine_name}</div>
                      <div className="flex min-w-0 items-center gap-1 text-xs text-neutral-500">
                        <span className="min-w-0 max-w-[160px] truncate font-mono sm:max-w-[220px]">
                          {a.id}
                        </span>
                        <CopyButton text={a.id} />
                      </div>
                    </td>
                    <td>{a.version ?? "—"}</td>
                    <td className="whitespace-nowrap">{formatThaiDateTime(a.last_seen_at)}</td>
                    <td>
                      {a.status === "revoked" ? (
                        <span className="inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">
                          เพิกถอนแล้ว
                        </span>
                      ) : a.status === "online" ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          ● ออนไลน์
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">
                          ○ ออฟไลน์
                        </span>
                      )}
                    </td>
                    <td>
                      {a.status !== "revoked" && (
                        <button
                          className="btn-danger px-2 py-1 text-xs"
                          onClick={() => handleRevoke(a.id, a.agent_name)}
                        >
                          เพิกถอนเครื่อง
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
