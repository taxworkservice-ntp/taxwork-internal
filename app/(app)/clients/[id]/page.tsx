"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  addCredential as addCredentialAction,
  addShareholder as addShareholderAction,
  deleteClient as deleteClientAction,
  deleteCredential as deleteCredentialAction,
  deleteShareholder as deleteShareholderAction,
  getClientDetail,
  setDirector,
  toggleTaskStatus,
  updateClient,
  updateCredential as updateCredentialAction,
  type Credential,
} from "@/lib/actions/clients";
import CredentialRow from "@/components/credential-row";
import FileSection from "@/components/file-section";
import CopyButton from "@/components/copy-button";
import Badge from "@/components/badge";
import EmptyState from "@/components/empty-state";
import InlineConfirm from "@/components/inline-confirm";
import PasswordValue from "@/components/password-value";
import { ToastStack, useToasts } from "@/components/toast";

type Client = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
};

type TaskInstance = {
  id: string;
  title: string;
  period_label: string;
  due_date: string;
  status: string;
};

type Shareholder = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  shares: number | null;
  is_director: boolean;
  notes: string | null;
};

const PLATFORM_SUGGESTIONS = [
  "สรรพกร E-filing",
  "DBD E-filing",
  "ประกันสังคม",
];

const emptyCred = {
  label: "",
  username: "",
  password: "",
  portal_url: "",
  notes: "",
};

const emptyShareholder = {
  name: "",
  tax_id: "",
  email: "",
  phone: "",
  address: "",
  shares: "",
  is_director: false,
  notes: "",
};

function ValueRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  const text = value || "—";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 py-2 last:border-b-0">
      <span className="shrink-0 text-xs font-medium text-neutral-500">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-right text-sm text-neutral-800">
        <span className="min-w-0 break-words">{text}</span>
        {value && href && (
          <a href={href} className="shrink-0 text-xs text-blue-600 underline">
            เปิด
          </a>
        )}
        {value && <CopyButton text={value} />}
      </span>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [showCredForm, setShowCredForm] = useState(false);
  const [cred, setCred] = useState(emptyCred);
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [showShForm, setShowShForm] = useState(false);
  const [sh, setSh] = useState(emptyShareholder);
  const [edit, setEdit] = useState<Partial<Client>>({});
  const [showEditForm, setShowEditForm] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [confirmingCredId, setConfirmingCredId] = useState<string | null>(null);
  const [confirmingShId, setConfirmingShId] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  const load = useCallback(async () => {
    const d = await getClientDetail(id);
    if (d.client) {
      setClient(d.client);
      setEdit({
        name: d.client.name,
        tax_id: d.client.tax_id ?? "",
        email: d.client.email ?? "",
        phone: d.client.phone ?? "",
        address: d.client.address ?? "",
        notes: d.client.notes ?? "",
      });
    }
    setCredentials(d.credentials);
    setTasks(d.tasks);
    setShareholders(d.shareholders);
     
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveClient() {
    if (savingClient) return;
    setSavingClient(true);
    try {
      await updateClient(id, edit);
      setShowEditForm(false);
      await load();
      push({ type: "success", message: "บันทึกข้อมูลลูกค้าแล้ว" });
    } catch {
      push({ type: "error", message: "บันทึกข้อมูลไม่สำเร็จ" });
    } finally {
      setSavingClient(false);
    }
  }

  async function deleteClient() {
    try {
      await deleteClientAction(id);
      window.location.href = "/clients";
    } catch {
      push({ type: "error", message: "ลบลูกค้าไม่สำเร็จ" });
    }
  }

  async function saveCredential(e: React.FormEvent) {
    e.preventDefault();
    const isEdit = Boolean(editingCredId);
    try {
      if (editingCredId) await updateCredentialAction(editingCredId, cred);
      else await addCredentialAction(id, cred);
      setCred(emptyCred);
      setEditingCredId(null);
      setShowCredForm(false);
      await load();
      push({ type: "success", message: isEdit ? "แก้ไขข้อมูลเข้าระบบแล้ว" : "เพิ่มข้อมูลเข้าระบบแล้ว" });
    } catch {
      push({ type: "error", message: "บันทึกข้อมูลเข้าระบบไม่สำเร็จ" });
    }
  }

  function startEditCredential(c: Credential) {
    setCred({
      label: c.label ?? "",
      username: c.username ?? "",
      password: c.password ?? "",
      portal_url: c.portal_url ?? "",
      notes: c.notes ?? "",
    });
    setEditingCredId(c.id);
    setShowCredForm(true);
  }

  function cancelCredForm() {
    setCred(emptyCred);
    setEditingCredId(null);
    setShowCredForm(false);
  }

  async function deleteCredential(cid: string) {
    setConfirmingCredId(null);
    try {
      await deleteCredentialAction(cid);
      await load();
      push({ type: "success", message: "ลบข้อมูลเข้าระบบแล้ว" });
    } catch {
      push({ type: "error", message: "ลบข้อมูลเข้าระบบไม่สำเร็จ" });
    }
  }

  async function addShareholder(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addShareholderAction(id, sh);
      setSh(emptyShareholder);
      setShowShForm(false);
      await load();
      push({ type: "success", message: "เพิ่มผู้ถือหุ้นแล้ว" });
    } catch {
      push({ type: "error", message: "เพิ่มผู้ถือหุ้นไม่สำเร็จ" });
    }
  }

  async function deleteShareholder(sid: string) {
    setConfirmingShId(null);
    try {
      await deleteShareholderAction(sid);
      await load();
      push({ type: "success", message: "ลบผู้ถือหุ้นแล้ว" });
    } catch {
      push({ type: "error", message: "ลบผู้ถือหุ้นไม่สำเร็จ" });
    }
  }

  async function toggleDirector(shh: Shareholder) {
    try {
      await setDirector(id, shh.id);
      await load();
    } catch {
      push({ type: "error", message: "ตั้งกรรมการไม่สำเร็จ" });
    }
  }

  async function toggleTask(task: TaskInstance) {
    try {
      await toggleTaskStatus(task.id, task.status === "done" ? "todo" : "done");
      await load();
    } catch {
      push({ type: "error", message: "อัปเดตงานไม่สำเร็จ" });
    }
  }

  if (!client) return <p className="text-sm text-neutral-500">กำลังโหลด...</p>;

  const todoTasks = tasks.filter((task) => task.status !== "done");
  const doneTasks = tasks.length - todoTasks.length;
  const director = shareholders.find((s) => s.is_director);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="-mx-4 border-b border-neutral-200 bg-white px-4 pb-4 pt-2 sm:mx-0 sm:rounded sm:border sm:p-4">
        <Link href="/clients" className="mb-3 inline-block text-sm text-neutral-500">
          ← ลูกค้า
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-xl font-semibold leading-snug">{client.name}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {client.tax_id ? `เลขภาษี ${client.tax_id}` : "ยังไม่มีเลขผู้เสียภาษี"}
            </p>
          </div>
          <Badge tone={client.status === "active" ? "success" : "neutral"}>
            {client.status === "active" ? "ใช้งาน" : "เก็บถาวร"}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {client.phone ? (
            <a className="btn text-center" href={`tel:${client.phone}`}>โทร</a>
          ) : (
            <button className="btn text-center" disabled>โทร</button>
          )}
          {client.email ? (
            <a className="btn text-center" href={`mailto:${client.email}`}>อีเมล</a>
          ) : (
            <button className="btn text-center" disabled>อีเมล</button>
          )}
          <Link className="btn-primary text-center" href={`/clients/${id}/notes`}>
            โน้ต
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded border border-neutral-200 bg-neutral-50 p-2">
          <div className="text-center">
            <p className="text-lg font-semibold">{todoTasks.length}</p>
            <p className="text-xs text-neutral-500">งานค้าง</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">{doneTasks}</p>
            <p className="text-xs text-neutral-500">งานเสร็จ</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">{credentials.length}</p>
            <p className="text-xs text-neutral-500">Login</p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-medium">ภาพรวม</h2>
          <button className="btn" onClick={() => setShowEditForm(!showEditForm)}>
            {showEditForm ? "ปิด" : "แก้ไข"}
          </button>
        </div>
        {!showEditForm ? (
          <div>
            <ValueRow label="โทรศัพท์" value={client.phone} href={client.phone ? `tel:${client.phone}` : undefined} />
            <ValueRow label="อีเมล" value={client.email} href={client.email ? `mailto:${client.email}` : undefined} />
            <ValueRow label="ที่อยู่" value={client.address} />
            <ValueRow label="หมายเหตุ" value={client.notes} />
            <ValueRow label="กรรมการ" value={director?.name} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">ชื่อบริษัท</label>
              <input className="input" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div>
              <label className="label">เลขผู้เสียภาษี</label>
              <input className="input" value={edit.tax_id ?? ""} onChange={(e) => setEdit({ ...edit, tax_id: e.target.value })} />
            </div>
            <div>
              <label className="label">อีเมล</label>
              <input className="input" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </div>
            <div>
              <label className="label">โทรศัพท์</label>
              <input className="input" value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">ที่อยู่</label>
              <input className="input" value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">หมายเหตุ</label>
              <textarea className="input" rows={2} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </div>
            <button className="btn-primary w-fit sm:col-span-2" onClick={saveClient} disabled={savingClient}>
              {savingClient ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
          </div>
        )}
      </section>

      {/* Credentials */}
      <section className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">ข้อมูลเข้าระบบ</h2>
          <button
            className="btn"
            onClick={() => {
              if (showCredForm) cancelCredForm();
              else setShowCredForm(true);
            }}
          >
            {showCredForm ? "ยกเลิก" : "เพิ่มข้อมูลเข้าระบบ"}
          </button>
        </div>
        {showCredForm && (
          <form onSubmit={saveCredential} className="card mb-3 space-y-3">
            <div>
              <label className="label">แพลตฟอร์ม * (เลือกหรือพิมพ์เอง)</label>
              <input
                className="input"
                required
                list="platform-suggestions"
                placeholder="เช่น สรรพกร E-filing"
                value={cred.label}
                onChange={(e) => setCred({ ...cred, label: e.target.value })}
              />
              <datalist id="platform-suggestions">
                {PLATFORM_SUGGESTIONS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">ผู้ใช้</label>
                <input className="input" value={cred.username} onChange={(e) => setCred({ ...cred, username: e.target.value })} />
              </div>
              <div>
                <label className="label">รหัสผ่าน</label>
                <input className="input" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">URL เว็บไซต์</label>
              <input className="input" value={cred.portal_url} onChange={(e) => setCred({ ...cred, portal_url: e.target.value })} />
            </div>
            <div>
              <label className="label">หมายเหตุ</label>
              <input className="input" value={cred.notes} onChange={(e) => setCred({ ...cred, notes: e.target.value })} />
            </div>
            <button className="btn-primary">{editingCredId ? "บันทึกการแก้ไข" : "บันทึก"}</button>
          </form>
        )}
        <div className="space-y-2 md:hidden">
          {credentials.map((c) => (
            <div key={c.id} className="rounded border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">{c.label}</h3>
                <div className="flex shrink-0 items-center gap-3">
                  {confirmingCredId === c.id ? (
                    <InlineConfirm
                      message="ลบข้อมูลนี้?"
                      confirmLabel="ลบ"
                      onConfirm={() => deleteCredential(c.id)}
                      onCancel={() => setConfirmingCredId(null)}
                    />
                  ) : (
                    <>
                      <button className="text-xs text-blue-600 underline" onClick={() => startEditCredential(c)}>
                        แก้ไข
                      </button>
                      <button className="text-xs text-red-600 underline" onClick={() => setConfirmingCredId(c.id)}>
                        ลบ
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">ผู้ใช้</span>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate">{c.username || "—"}</span>
                    {c.username && <CopyButton text={c.username} />}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">รหัสผ่าน</span>
                  <PasswordValue value={c.password} />
                </div>
              </div>
            </div>
          ))}
          {!credentials.length && <EmptyState title="ยังไม่มีข้อมูลเข้าระบบ" hint="กดเพิ่มข้อมูลเข้าระบบด้านบน" />}
        </div>
        <table className="table-base hidden md:table">
          <thead>
            <tr><th>แพลตฟอร์ม</th><th>ผู้ใช้</th><th>รหัสผ่าน</th><th></th></tr>
          </thead>
          <tbody>
            {credentials.map((c) => (
              <CredentialRow
                key={c.id}
                credential={c}
                confirming={confirmingCredId === c.id}
                onEdit={() => startEditCredential(c)}
                onRequestDelete={() => setConfirmingCredId(c.id)}
                onConfirmDelete={() => deleteCredential(c.id)}
                onCancelDelete={() => setConfirmingCredId(null)}
              />
            ))}
            {!credentials.length && (
              <tr>
                <td colSpan={4}>
                  <EmptyState title="ยังไม่มีข้อมูลเข้าระบบ" hint="กดเพิ่มข้อมูลเข้าระบบด้านบน" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Shareholders */}
      <section className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">ผู้ถือหุ้น</h2>
          <button className="btn" onClick={() => setShowShForm(!showShForm)}>
            {showShForm ? "ยกเลิก" : "เพิ่มผู้ถือหุ้น"}
          </button>
        </div>
        {showShForm && (
          <form onSubmit={addShareholder} className="card mb-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">ชื่อ *</label>
                <input
                  className="input"
                  required
                  value={sh.name}
                  onChange={(e) => setSh({ ...sh, name: e.target.value })}
                />
              </div>
              <div>
                <label className="label">เลขผู้เสียภาษี / เลขบัตร</label>
                <input
                  className="input"
                  value={sh.tax_id}
                  onChange={(e) => setSh({ ...sh, tax_id: e.target.value })}
                />
              </div>
              <div>
                <label className="label">อีเมล</label>
                <input
                  className="input"
                  type="email"
                  value={sh.email}
                  onChange={(e) => setSh({ ...sh, email: e.target.value })}
                />
              </div>
              <div>
                <label className="label">โทรศัพท์</label>
                <input
                  className="input"
                  value={sh.phone}
                  onChange={(e) => setSh({ ...sh, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="label">ที่อยู่</label>
                <input
                  className="input"
                  value={sh.address}
                  onChange={(e) => setSh({ ...sh, address: e.target.value })}
                />
              </div>
              <div>
                <label className="label">สัดส่วนหุ้น (%)</label>
                <input
                  className="input"
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={sh.shares}
                  onChange={(e) => setSh({ ...sh, shares: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">หมายเหตุ</label>
              <input
                className="input"
                value={sh.notes}
                onChange={(e) => setSh({ ...sh, notes: e.target.value })}
              />
            </div>
            <label className="flex w-fit items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sh.is_director}
                onChange={(e) => setSh({ ...sh, is_director: e.target.checked })}
              />
              กรรมการผู้จัดการ / ผู้มีอำนาจลงนาม
            </label>
            <button className="btn-primary w-fit">บันทึก</button>
          </form>
        )}
        <div className="space-y-2 md:hidden">
          {shareholders.map((s) => (
            <div key={s.id} className="rounded border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">{s.name}</h3>
                  {s.is_director && <p className="text-xs text-blue-700">กรรมการผู้จัดการ / ผู้มีอำนาจลงนาม</p>}
                </div>
                {confirmingShId === s.id ? (
                  <InlineConfirm
                    message="ลบผู้ถือหุ้น?"
                    confirmLabel="ลบ"
                    onConfirm={() => deleteShareholder(s.id)}
                    onCancel={() => setConfirmingShId(null)}
                  />
                ) : (
                  <button className="text-xs text-red-600 underline" onClick={() => setConfirmingShId(s.id)}>
                    ลบ
                  </button>
                )}
              </div>
              <div className="space-y-1 text-sm text-neutral-700">
                <p>เลขภาษี: {s.tax_id || "—"}</p>
                <p>โทร: {s.phone || "—"}</p>
                <p>อีเมล: {s.email || "—"}</p>
                <p>หุ้น: {s.shares ?? "—"}%</p>
              </div>
              {!s.is_director && (
                <button className="mt-3 text-xs text-blue-700 underline" onClick={() => toggleDirector(s)}>
                  ตั้งเป็นกรรมการ
                </button>
              )}
            </div>
          ))}
          {!shareholders.length && <EmptyState title="ยังไม่มีผู้ถือหุ้น" hint="กดเพิ่มผู้ถือหุ้นด้านบน" />}
        </div>
        <table className="table-base hidden md:table">
          <thead>
            <tr>
              <th>กรรมการ</th>
              <th>ชื่อ</th>
              <th>เลขผู้เสียภาษี</th>
              <th>อีเมล</th>
              <th>โทรศัพท์</th>
              <th>หุ้น (%)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shareholders.map((s) => (
              <tr key={s.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={s.is_director}
                    title="ตั้งเป็นกรรมการ (คนเดียว)"
                    onChange={() => toggleDirector(s)}
                  />
                </td>
                <td>{s.name}</td>
                <td>{s.tax_id || "—"}</td>
                <td>{s.email || "—"}</td>
                <td>{s.phone || "—"}</td>
                <td>{s.shares ?? "—"}</td>
                <td className="text-right">
                  {confirmingShId === s.id ? (
                    <InlineConfirm
                      message="ลบ?"
                      confirmLabel="ลบ"
                      onConfirm={() => deleteShareholder(s.id)}
                      onCancel={() => setConfirmingShId(null)}
                    />
                  ) : (
                    <button
                      className="text-xs text-red-600 underline"
                      onClick={() => setConfirmingShId(s.id)}
                    >
                      ลบ
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!shareholders.length && (
              <tr>
                <td colSpan={7}>
                  <EmptyState title="ยังไม่มีผู้ถือหุ้น" hint="กดเพิ่มผู้ถือหุ้นด้านบน" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Files */}
      <FileSection clientId={id} onChanged={load} />

      {/* Tasks */}
      <section className="card">
        <h2 className="mb-2 font-medium">งานของลูกค้านี้</h2>
        <div className="space-y-2 md:hidden">
          {tasks.map((t) => (
            <label key={t.id} className="flex gap-3 rounded border border-neutral-200 bg-neutral-50 p-3">
              <input type="checkbox" checked={t.status === "done"} onChange={() => toggleTask(t)} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${t.status === "done" ? "text-neutral-400 line-through" : ""}`}>
                  {t.title}
                </span>
                <span className="mt-1 block text-xs text-neutral-500">
                  {t.period_label} · {t.due_date}
                </span>
              </span>
            </label>
          ))}
          {!tasks.length && <EmptyState title="ยังไม่มีงาน" />}
        </div>
        <table className="table-base hidden md:table">
          <thead>
            <tr><th>เสร็จ</th><th>งาน</th><th>งวด</th><th>กำหนดส่ง</th></tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>
                  <input type="checkbox" checked={t.status === "done"} onChange={() => toggleTask(t)} />
                </td>
                <td className={t.status === "done" ? "text-neutral-400 line-through" : ""}>{t.title}</td>
                <td>{t.period_label}</td>
                <td>{t.due_date}</td>
              </tr>
            ))}
            {!tasks.length && (
              <tr>
                <td colSpan={4}>
                  <EmptyState title="ยังไม่มีงาน" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="mb-2 font-medium">จัดการลูกค้า</h2>
        {!confirmingDelete ? (
          <button className="btn-danger" onClick={() => setConfirmingDelete(true)}>
            ลบลูกค้านี้
          </button>
        ) : (
          <div className="rounded border border-red-200 bg-red-50 p-3">
            <p className="mb-2 text-sm text-red-700">
              จะลบ <strong>{client.name}</strong> พร้อมข้อมูลเข้าระบบ ไฟล์ และงานทั้งหมดของลูกค้านี้ ไม่สามารถกู้คืนได้
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input min-w-0 flex-1 border-red-300 bg-white"
                placeholder={`พิมพ์ "${client.name}" เพื่อยืนยัน`}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
              />
              <button
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
                disabled={deleteInput !== client.name}
                onClick={deleteClient}
              >
                ลบถาวร
              </button>
              <button
                className="btn"
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteInput("");
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </section>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
