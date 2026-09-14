"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CopyButton from "@/components/copy-button";
import {
  approveRestore,
  cancelRestore,
  confirmRestore,
  createBackupAllJobs,
  createManualBackupJob,
  getAgents,
  getBackupStorageStats,
  getExpressBackupDetail,
  getExpressBackupOverview,
  getRestores,
  registerAgent,
  requestRestore,
  revokeAgent,
  saveAgentPath,
  setPrimaryAgentPath,
  type OverviewRow,
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
  const [importClient, setImportClient] = useState<{ id: string; name: string } | null>(null);
  const [importDetail, setImportDetail] = useState<{
    jobId: string;
    fileName: string | null;
    size: number | null;
    at: string | null;
    agents: { id: string; name: string; machine: string; online: boolean }[];
    paths: Record<string, string>;
    primaryAgent: string | null;
    machineCount: number;
  } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importAgent, setImportAgent] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [rememberHome, setRememberHome] = useState(true);
  const [importStage, setImportStage] = useState<"form" | "preparing" | "ready" | "placing" | "done" | "error">("form");
  const [importRestore, setImportRestore] = useState<{
    id: string;
    status: string;
    stagedCount: number | null;
    bakPath: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  } | null>(null);
  const [importError, setImportError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopImportPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function closeImport() {
    stopImportPoll();
    setImportClient(null);
    setImportDetail(null);
    setImportStage("form");
    setImportRestore(null);
    setImportError("");
  }

  useEffect(() => () => stopImportPoll(), []);

  function pollRestore(clientId: string, restoreId: string, next: "ready" | "done") {
    stopImportPoll();
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const list = await getRestores(clientId);
        const r = list.find((x) => x.id === restoreId);
        if (!r) return;
        const snap = {
          id: r.id,
          status: r.status,
          stagedCount: r.staged_file_count,
          bakPath: r.bak_path,
          errorCode: r.error_code,
          errorMessage: r.error_message,
        };
        setImportRestore(snap);
        if (next === "ready" && r.status === "staged") {
          stopImportPoll();
          setImportStage("ready");
          setImportBusy(false);
        } else if (next === "done" && r.status === "completed") {
          stopImportPoll();
          setImportStage("done");
          setImportBusy(false);
          load();
        } else if (["failed", "cancelled", "rejected"].includes(r.status)) {
          stopImportPoll();
          setImportBusy(false);
          setImportError(
            r.error_code
              ? `${thaiError(r.error_code)} (${r.error_code})${r.error_message ? ` — ${r.error_message}` : ""}`
              : "รายการนี้ถูกยกเลิกหรือล้มเหลว"
          );
          setImportStage("error");
        } else if (attempts >= 100) {
          stopImportPoll();
          setImportBusy(false);
          setImportError("รอนานเกินไป เครื่องปลายทางอาจออฟไลน์อยู่ ติดตามต่อได้ที่หน้ารายละเอียด");
          setImportStage("error");
        }
      } catch {
        // transient — keep polling until timeout
        if (attempts >= 100) {
          stopImportPoll();
          setImportBusy(false);
          setImportError("ติดต่อเซิร์ฟเวอร์ไม่ได้ ติดตามต่อได้ที่หน้ารายละเอียด");
          setImportStage("error");
        }
      }
    }, 3000);
  }

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
      const r = await createManualBackupJob(clientId);
      setMessage(
        r.ids.length > 1 ? `สร้างงาน ${r.ids.length} งาน รอเครื่องดำเนินการ` : "สร้างงานแล้ว รอเครื่องดำเนินการ"
      );
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

  async function openImport(clientId: string, clientName: string) {
    stopImportPoll();
    setImportClient({ id: clientId, name: clientName });
    setImportDetail(null);
    setImportAgent("");
    setImportPath("");
    setImportStage("form");
    setImportRestore(null);
    setImportError("");
    setImportLoading(true);
    try {
      const d = await getExpressBackupDetail(clientId);
      if (!d.latest_success) {
        alert("ยังไม่มีไฟล์สำรองของบริษัทนี้");
        setImportClient(null);
        return;
      }
      const active = d.agents.filter((a) => a.status !== "revoked");
      const paths: Record<string, string> = {};
      for (const p of d.agent_paths) paths[p.agent_id] = p.source_path;
      const primary = d.agent_paths.find((p) => p.is_primary)?.agent_id ?? null;
      const onlineFirst = [...active].sort((a, b) =>
        a.status === b.status ? 0 : a.status === "online" ? -1 : 1
      );
      const defAgent = primary ?? onlineFirst[0]?.id ?? "";
      setImportDetail({
        jobId: d.latest_success.id,
        fileName: d.latest_success.file_name,
        size: d.latest_success.backup_size_bytes,
        at: d.latest_success.completed_at ?? d.latest_success.created_at,
        agents: active.map((a) => ({
          id: a.id,
          name: a.agent_name,
          machine: a.machine_name,
          online: a.status === "online",
        })),
        paths,
        primaryAgent: primary,
        machineCount: d.agent_paths.length,
      });
      setImportAgent(defAgent);
      setImportPath(paths[defAgent] ?? d.config?.source_path ?? "");
      setRememberHome(!primary);
    } catch (e) {
      alert(e instanceof Error ? e.message : "โหลดข้อมูลรับไฟล์ไม่สำเร็จ");
      setImportClient(null);
    } finally {
      setImportLoading(false);
    }
  }

  async function confirmImport() {
    if (!importClient || !importDetail) return;
    if (!importAgent) {
      alert("กรุณาเลือกเครื่องปลายทาง");
      return;
    }
    if (!importPath.trim()) {
      alert("กรุณาระบุโฟลเดอร์ปลายทาง");
      return;
    }
    setImportBusy(true);
    setImportError("");
    try {
      const r = await requestRestore(importDetail.jobId, importAgent, importPath.trim());
      try {
        await approveRestore(r.id);
      } catch {
        // requested ok, approve may fail if duplicate — keep tracking it
      }
      if (rememberHome) {
        try {
          await saveAgentPath(importAgent, importClient.id, importPath.trim());
          await setPrimaryAgentPath(importAgent, importClient.id);
        } catch {
          // home-machine memory is best-effort — import already succeeded
        }
      }
      setImportRestore({
        id: r.id,
        status: r.status,
        stagedCount: null,
        bakPath: null,
        errorCode: null,
        errorMessage: null,
      });
      setImportStage("preparing");
      pollRestore(importClient.id, r.id, "ready");
    } catch (e) {
      setImportBusy(false);
      setImportError(e instanceof Error ? e.message : "รับข้อมูลไม่สำเร็จ");
      setImportStage("error");
    }
  }

  async function confirmPlace() {
    if (!importClient || !importRestore) return;
    setImportBusy(true);
    setImportError("");
    try {
      await confirmRestore(importRestore.id);
      setImportStage("placing");
      pollRestore(importClient.id, importRestore.id, "done");
    } catch (e) {
      setImportBusy(false);
      setImportError(e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ");
      setImportStage("error");
    }
  }

  async function cancelImportFlow() {
    if (importRestore && (importStage === "preparing" || importStage === "ready")) {
      if (!confirm("ยกเลิกรายการรับข้อมูลนี้?")) return;
      try {
        await cancelRestore(importRestore.id);
      } catch {
        // fall through to close — detail page still shows it
      }
    }
    closeImport();
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
                          {r.machine_count > 1 && (
                            <div className="text-xs text-neutral-500">{r.machine_count} เครื่อง</div>
                          )}
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
                      <div className="flex flex-wrap items-center gap-1">
                        <Link href={`/express-backup/${r.client_id}`} className="btn px-2 py-1 text-xs">
                          เปิด
                        </Link>
                        <button
                          className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={busy !== null || !r.has_config || !r.enabled}
                          title={!r.has_config ? "ยังไม่ได้ตั้งค่า" : "สำรองข้อมูลตอนนี้"}
                          onClick={() => {
                            if (!confirm(`สำรองข้อมูลของ "${r.client_name}" ตอนนี้?`)) return;
                            handleBackupOne(r.client_id);
                          }}
                        >
                          {busy === r.client_id ? "…" : "สำรองตอนนี้"}
                        </button>
                        {r.latest_success_at ? (
                          <button
                            className="btn-primary px-2 py-1 text-xs"
                            title={`รับข้อมูลสำรองล่าสุด (${formatThaiDateTime(r.latest_success_at)}) ไปเครื่องอื่น — กดครั้งเดียวจบ`}
                            onClick={() => openImport(r.client_id, r.client_name)}
                          >
                            รับข้อมูล
                          </button>
                        ) : (
                          <span
                            className="btn cursor-not-allowed px-2 py-1 text-xs opacity-40"
                            title="ยังไม่มีไฟล์สำรอง — รับข้อมูลได้หลังสำรองครั้งแรกสำเร็จ"
                          >
                            รับข้อมูล
                          </span>
                        )}
                        <details className="relative">
                          <summary
                            className="cursor-pointer list-none rounded px-1.5 py-1 text-sm leading-none text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 [&::-webkit-details-marker]:hidden"
                            title="เพิ่มเติม"
                          >
                            ⋯
                          </summary>
                          <div className="absolute right-0 z-10 min-w-[160px] rounded-md border bg-white py-1 shadow-lg">
                            <button
                              className="block w-full px-3 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-50"
                              onClick={(e) => {
                                (e.target as HTMLElement).closest("details")?.removeAttribute("open");
                                if (
                                  !hidden.includes(r.client_id) &&
                                  !confirm(`ซ่อน "${r.client_name}" จากรายการ? (เอากลับมาได้จากปุ่มแสดงที่ซ่อนอยู่)`)
                                )
                                  return;
                                toggleHide(r.client_id);
                              }}
                            >
                              {hidden.includes(r.client_id) ? "↩ เลิกซ่อนบริษัทนี้" : "🙈 ซ่อนบริษัทนี้"}
                            </button>
                          </div>
                        </details>
                      </div>
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

      {importClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h3 className="font-medium">รับข้อมูล — {importClient.name}</h3>
            {importStage === "form" && (
              <>
                {importLoading || !importDetail ? (
                  <p className="mt-3 text-sm text-neutral-500">กำลังเตรียมข้อมูล...</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-neutral-600">
                      ไฟล์ล่าสุด {formatThaiDateTime(importDetail.at)} · {formatBytes(importDetail.size)}
                      <span className="block truncate font-mono text-xs text-neutral-500" title={importDetail.fileName ?? ""}>
                        {importDetail.fileName ?? ""}
                      </span>
                    </p>
                    {(() => {
                      const home = importDetail.agents.find((a) => a.id === importAgent);
                      return home ? (
                        <div className="rounded border border-neutral-200 bg-neutral-50 p-2 text-sm">
                          <span className="text-neutral-500">รับเข้าเครื่องหลัก: </span>
                          <span className="font-medium">
                            🏠 {home.name} ({home.machine})
                          </span>
                          {!home.online && <span className="text-xs text-red-600"> (ออฟไลน์อยู่)</span>}
                          <span className="block truncate font-mono text-xs text-neutral-500" title={importPath}>
                            {importPath || "—"}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-red-600">ยังไม่มีเครื่อง กรุณาเพิ่มเครื่องก่อน</p>
                      );
                    })()}
                    {importDetail.machineCount > 1 && (
                      <p className="rounded border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800">
                        บริษัทนี้มีข้อมูลบน {importDetail.machineCount} เครื่อง — ตรวจว่าเครื่องหลักข้างบนคือตัวจริงก่อนกดรับ
                      </p>
                    )}
                    <details>
                      <summary className="cursor-pointer text-xs text-neutral-500 hover:underline">
                        เปลี่ยนเครื่อง / โฟลเดอร์
                      </summary>
                      <div className="mt-2 space-y-3">
                        <label className="label">
                          รับเข้าเครื่องไหน
                          <select
                            className="input"
                            value={importAgent}
                            onChange={(e) => {
                              const id = e.target.value;
                              setImportAgent(id);
                              if (importDetail.paths[id]) setImportPath(importDetail.paths[id]);
                            }}
                          >
                            {importDetail.agents.length === 0 && <option value="">ยังไม่มีเครื่อง</option>}
                            {importDetail.agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.machine}){a.online ? " ●" : ""}{importDetail.primaryAgent === a.id ? " ★หลัก" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="label">
                          โฟลเดอร์ปลายทาง
                          <input
                            className="input font-mono"
                            value={importPath}
                            onChange={(e) => setImportPath(e.target.value)}
                            placeholder="D:\ExpressData\ABC"
                          />
                        </label>
                      </div>
                    </details>
                    {importDetail.primaryAgent !== importAgent && (
                      <label className="flex cursor-pointer items-start gap-2 text-xs text-neutral-600">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={rememberHome}
                          onChange={(e) => setRememberHome(e.target.checked)}
                        />
                        จำเครื่องนี้เป็นเครื่องหลักของบริษัทนี้
                      </label>
                    )}
                    <p className="rounded bg-green-50 border border-green-200 p-2 text-xs text-green-800">
                      ทำครบในหน้าต่างนี้: เครื่องเตรียมไฟล์ให้ → คุณกดยืนยันครั้งเดียว → เสร็จ ของเดิมเก็บเป็น .bak ให้ก่อนเสมอ
                    </p>
                  </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn px-3 py-1.5 text-sm" disabled={importBusy} onClick={closeImport}>
                    ยกเลิก
                  </button>
                  <button
                    className="btn-primary px-3 py-1.5 text-sm"
                    disabled={importBusy || importLoading || !importDetail || !importAgent}
                    onClick={confirmImport}
                  >
                    {importBusy ? "กำลังรับ..." : "รับข้อมูลเลย"}
                  </button>
                </div>
              </>
            )}
            {importStage === "preparing" && (
              <>
                <div className="mt-3 space-y-3">
                  <p className="text-sm">
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent align-middle" />
                    เครื่องกำลังเตรียมไฟล์… (ปกติไม่เกิน 1–2 นาที)
                  </p>
                  <p className="text-xs text-neutral-500">
                    เครื่องปลายทางตรวจงานทุก ~30 วินาที หน้านี้รอให้เอง ไม่ต้องกดอะไร
                    {importRestore && (
                      <span className="block font-mono">สถานะ: {importRestore.status}</span>
                    )}
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn px-3 py-1.5 text-sm" onClick={cancelImportFlow}>
                    ยกเลิก
                  </button>
                </div>
              </>
            )}
            {importStage === "ready" && (
              <>
                <div className="mt-3 space-y-3">
                  <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-800">
                    เครื่องเตรียมไฟล์แล้ว{importRestore?.stagedCount != null && ` ${importRestore.stagedCount} ไฟล์`} — พร้อมย้ายเข้า
                  </p>
                  <p className="truncate font-mono text-xs text-neutral-500" title={importPath}>
                    ปลายทาง: {importPath}
                  </p>
                  <p className="text-xs text-neutral-500">
                    กดยืนยัน เครื่องจะเก็บของเดิมเป็น .bak ให้ก่อนแล้วจึงย้ายไฟล์เข้า
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn px-3 py-1.5 text-sm" disabled={importBusy} onClick={cancelImportFlow}>
                    ยกเลิก
                  </button>
                  <button
                    className="btn-danger px-3 py-1.5 text-sm"
                    disabled={importBusy}
                    onClick={confirmPlace}
                  >
                    {importBusy ? "…" : "ยืนยันย้ายไฟล์เข้า"}
                  </button>
                </div>
              </>
            )}
            {importStage === "placing" && (
              <>
                <div className="mt-3 space-y-3">
                  <p className="text-sm">
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent align-middle" />
                    กำลังย้ายไฟล์เข้าเครื่องปลายทาง…
                  </p>
                  <p className="text-xs text-neutral-500">หน้านี้รอให้เอง ไม่ต้องกดอะไร</p>
                </div>
              </>
            )}
            {importStage === "done" && (
              <>
                <div className="mt-3 space-y-2">
                  <p className="rounded border border-green-200 bg-green-50 p-2 text-sm font-medium text-green-800">
                    ✓ รับข้อมูลเสร็จแล้ว เปิด Express ที่เครื่องปลายทางตรวจดูได้เลย
                  </p>
                  {importRestore?.bakPath && (
                    <p className="truncate font-mono text-xs text-neutral-500" title={importRestore.bakPath}>
                      ของเดิมเก็บไว้ที่ {importRestore.bakPath} (เอากลับได้)
                    </p>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn-primary px-3 py-1.5 text-sm" onClick={closeImport}>
                    ปิด
                  </button>
                </div>
              </>
            )}
            {importStage === "error" && (
              <>
                <div className="mt-3 space-y-2">
                  <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                    {importError || "เกิดข้อผิดพลาด"}
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn px-3 py-1.5 text-sm" onClick={closeImport}>
                    ปิด
                  </button>
                  <button
                    className="btn-primary px-3 py-1.5 text-sm"
                    onClick={() => {
                      stopImportPoll();
                      setImportRestore(null);
                      setImportError("");
                      setImportStage("form");
                      setImportBusy(false);
                    }}
                  >
                    ลองใหม่
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
