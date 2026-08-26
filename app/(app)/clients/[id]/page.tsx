"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CredentialRow from "@/components/credential-row";
import FileSection from "@/components/file-section";

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

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [client, setClient] = useState<Client | null>(null);
  const [credentials, setCredentials] = useState<
    (typeof emptyCred & { id: string })[]
  >([]);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [showCredForm, setShowCredForm] = useState(false);
  const [cred, setCred] = useState(emptyCred);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [showShForm, setShowShForm] = useState(false);
  const [sh, setSh] = useState(emptyShareholder);
  const [edit, setEdit] = useState<Partial<Client>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const load = useCallback(async () => {
    const [c, creds, t, shs] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).single(),
      supabase.from("credentials").select("*").eq("client_id", id).order("label"),
      supabase
        .from("task_instances")
        .select("*")
        .eq("client_id", id)
        .order("due_date", { ascending: false }),
      supabase.from("shareholders").select("*").eq("client_id", id).order("name"),
    ]);
    if (c.data) {
      setClient(c.data);
      setEdit({
        name: c.data.name,
        tax_id: c.data.tax_id ?? "",
        email: c.data.email ?? "",
        phone: c.data.phone ?? "",
        address: c.data.address ?? "",
        notes: c.data.notes ?? "",
      });
    }
    setCredentials(creds.data ?? []);
    setTasks(t.data ?? []);
    setShareholders(shs.data ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveClient() {
    await supabase.from("clients").update(edit).eq("id", id);
    load();
  }

  async function deleteClient() {
    await supabase.from("clients").delete().eq("id", id);
    window.location.href = "/clients";
  }

  async function addCredential(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("credentials").insert({ ...cred, client_id: id });
    setCred(emptyCred);
    setShowCredForm(false);
    load();
  }

  async function deleteCredential(cid: string) {
    if (!confirm("Delete this credential?")) return;
    await supabase.from("credentials").delete().eq("id", cid);
    load();
  }

  async function addShareholder(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase
      .from("shareholders")
      .insert({
        ...sh,
        shares: sh.shares === "" ? null : Number(sh.shares),
        client_id: id,
      })
      .select()
      .single();
    if (!error && data && data.is_director) {
      await supabase
        .from("shareholders")
        .update({ is_director: false })
        .eq("client_id", id)
        .neq("id", data.id);
    }
    setSh(emptyShareholder);
    setShowShForm(false);
    load();
  }

  async function deleteShareholder(sid: string) {
    if (!confirm("Delete this shareholder?")) return;
    await supabase.from("shareholders").delete().eq("id", sid);
    load();
  }

  async function toggleDirector(shh: Shareholder) {
    await supabase.from("shareholders").update({ is_director: true }).eq("id", shh.id);
    await supabase
      .from("shareholders")
      .update({ is_director: false })
      .eq("client_id", id)
      .neq("id", shh.id);
    load();
  }

  async function toggleTask(task: TaskInstance) {
    const status = task.status === "done" ? "todo" : "done";
    await supabase
      .from("task_instances")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", task.id);
    load();
  }

  if (!client) return <p className="text-sm text-neutral-500">กำลังโหลด...</p>;

  return (
    <>
      <div className="mb-6 max-w-xl">
        <h1 className="mb-3 text-lg font-semibold">{client.name}</h1>
        <div className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div className="col-span-2">
            <label className="label">ที่อยู่</label>
            <input className="input" value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="label">หมายเหตุ</label>
            <textarea className="input" rows={2} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </div>
          <button className="btn-primary col-span-2 w-fit" onClick={saveClient}>
            บันทึกการแก้ไข
          </button>
        </div>

        {/* Danger zone */}
        <div className="mt-4">
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
        </div>
      </div>

      {/* Credentials */}
      <section className="mb-8 max-w-xl">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">ข้อมูลเข้าระบบ</h2>
          <button className="btn" onClick={() => setShowCredForm(!showCredForm)}>
            {showCredForm ? "ยกเลิก" : "เพิ่มข้อมูลเข้าระบบ"}
          </button>
        </div>
        {showCredForm && (
          <form onSubmit={addCredential} className="card mb-3 space-y-3">
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
            <button className="btn-primary">บันทึก</button>
          </form>
        )}
        <table className="table-base">
          <thead>
            <tr><th>แพลตฟอร์ม</th><th>ผู้ใช้</th><th>รหัสผ่าน</th><th></th></tr>
          </thead>
          <tbody>
            {credentials.map((c) => (
              <CredentialRow key={c.id} credential={c} onDelete={() => deleteCredential(c.id)} />
            ))}
            {!credentials.length && (
              <tr><td colSpan={4} className="text-neutral-500">ไม่มีข้อมูล</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Shareholders */}
      <section className="mb-8 max-w-3xl">
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
        <table className="table-base">
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
                <td>
                  <button
                    className="text-xs text-red-600 underline"
                    onClick={() => deleteShareholder(s.id)}
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {!shareholders.length && (
              <tr><td colSpan={7} className="text-neutral-500">ไม่มีข้อมูล</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Files */}
      <FileSection clientId={id} onChanged={load} />

      {/* Tasks */}
      <section className="mt-8 max-w-xl">
        <h2 className="mb-2 font-medium">งานของลูกค้านี้</h2>
        <table className="table-base">
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
              <tr><td colSpan={4} className="text-neutral-500">ไม่มีงาน</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
