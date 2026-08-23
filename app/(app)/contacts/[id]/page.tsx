"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Contact = {
  id: string;
  name: string;
  firm: string | null;
  type: "auditor" | "accountant" | "both";
  tax_id: string | null;
  license_no: string | null;
  phone: string | null;
  email: string | null;
  line_id: string | null;
  address: string | null;
  notes: string | null;
};

type ClientRef = {
  id: string;
  name: string;
  contact_id: string | null;
};

const TYPE_LABELS = {
  auditor: "ผู้สอบบัญชี",
  accountant: "นักบัญชี",
  both: "ผู้สอบบัญชี + นักบัญชี",
} as const;

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [contact, setContact] = useState<Contact | null>(null);
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [initiallyAssignedIds, setInitiallyAssignedIds] = useState<string[]>([]);
  const [edit, setEdit] = useState<Partial<Contact>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [c, cl] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", id).single(),
      supabase.from("clients").select("id, name, contact_id").order("name"),
    ]);
    if (c.data) {
      setContact(c.data);
      setEdit({
        name: c.data.name,
        firm: c.data.firm ?? "",
        type: c.data.type,
        tax_id: c.data.tax_id ?? "",
        license_no: c.data.license_no ?? "",
        phone: c.data.phone ?? "",
        email: c.data.email ?? "",
        line_id: c.data.line_id ?? "",
        address: c.data.address ?? "",
        notes: c.data.notes ?? "",
      });
    }
    setClients(cl.data ?? []);
    const assigned = (cl.data ?? [])
      .filter((cl) => cl.contact_id === id)
      .map((cl) => cl.id);
    setSelectedClientIds(assigned);
    setInitiallyAssignedIds(assigned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleClient(clientId: string) {
    setSelectedClientIds((prev) =>
      prev.includes(clientId)
        ? prev.filter((x) => x !== clientId)
        : [...prev, clientId]
    );
  }

  async function save() {
    await supabase.from("contacts").update(edit).eq("id", id);
    const toAssign = selectedClientIds.filter(
      (cid) => !initiallyAssignedIds.includes(cid)
    );
    const toRelease = initiallyAssignedIds.filter(
      (cid) => !selectedClientIds.includes(cid)
    );
    if (toAssign.length) {
      await supabase.from("clients").update({ contact_id: id }).in("id", toAssign);
    }
    if (toRelease.length) {
      await supabase.from("clients").update({ contact_id: null }).in("id", toRelease);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    load();
  }

  async function deleteContact() {
    await supabase.from("contacts").delete().eq("id", id);
    window.location.href = "/contacts";
  }

  if (!contact) return <p className="text-sm text-neutral-500">กำลังโหลด...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        {contact.name}
        {saved && <span className="text-xs font-normal text-green-600">บันทึกแล้ว</span>}
      </h1>

      <div className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">ชื่อ *</label>
          <input
            className="input"
            value={edit.name ?? ""}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">บริษัท / สำนักงาน</label>
          <input
            className="input"
            value={edit.firm ?? ""}
            onChange={(e) => setEdit({ ...edit, firm: e.target.value })}
          />
        </div>
        <div>
          <label className="label">ประเภท</label>
          <select
            className="input"
            value={edit.type ?? "accountant"}
            onChange={(e) =>
              setEdit({ ...edit, type: e.target.value as Contact["type"] })
            }
          >
            {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((k) => (
              <option key={k} value={k}>
                {TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">เลขผู้เสียภาษี</label>
          <input
            className="input"
            value={edit.tax_id ?? ""}
            onChange={(e) => setEdit({ ...edit, tax_id: e.target.value })}
          />
        </div>
        <div>
          <label className="label">เลขใบอนุญาต (Audit ID)</label>
          <input
            className="input"
            value={edit.license_no ?? ""}
            onChange={(e) => setEdit({ ...edit, license_no: e.target.value })}
          />
        </div>
        <div>
          <label className="label">โทรศัพท์</label>
          <input
            className="input"
            value={edit.phone ?? ""}
            onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="label">อีเมล</label>
          <input
            className="input"
            value={edit.email ?? ""}
            onChange={(e) => setEdit({ ...edit, email: e.target.value })}
          />
        </div>
        <div>
          <label className="label">LINE ID</label>
          <input
            className="input"
            value={edit.line_id ?? ""}
            onChange={(e) => setEdit({ ...edit, line_id: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="label">ที่อยู่</label>
          <input
            className="input"
            value={edit.address ?? ""}
            onChange={(e) => setEdit({ ...edit, address: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="label">หมายเหตุ</label>
          <textarea
            className="input"
            rows={2}
            value={edit.notes ?? ""}
            onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
          />
        </div>

        <div className="col-span-2">
          <label className="label">ลูกค้าที่ดูแล (หนึ่งลูกค้าเลือกผู้เกี่ยวข้องได้เพียงคนเดียว)</label>
          <div className="input max-h-44 overflow-y-auto p-1">
            {clients.length === 0 && (
              <p className="p-2 text-sm text-neutral-500">ยังไม่มีลูกค้า</p>
            )}
            {clients.map((cl) => {
              const takenByOther =
                cl.contact_id !== null && cl.contact_id !== id;
              const checked = selectedClientIds.includes(cl.id);
              return (
                <label
                  key={cl.id}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                    takenByOther
                      ? "cursor-not-allowed text-neutral-400"
                      : "hover:bg-neutral-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={takenByOther}
                    onChange={() => toggleClient(cl.id)}
                  />
                  {cl.name}
                  {takenByOther && (
                    <span className="ml-auto text-xs text-neutral-400">
                      ถูกมอบหมายให้ผู้เกี่ยวข้องอื่นแล้ว
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <button className="btn-primary col-span-2 w-fit" onClick={save}>
          บันทึกการแก้ไข
        </button>
      </div>

      {/* Danger zone */}
      <div className="mt-6">
        {!confirmingDelete ? (
          <button className="btn-danger" onClick={() => setConfirmingDelete(true)}>
            ลบผู้เกี่ยวข้องนี้
          </button>
        ) : (
          <div className="rounded border border-red-200 bg-red-50 p-3">
            <p className="mb-2 text-sm text-red-700">
              จะลบ <strong>{contact.name}</strong> และยกเลิกการมอบหมายลูกค้าทั้งหมด ไม่สามารถกู้คืนได้
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input min-w-0 flex-1 border-red-300 bg-white"
                placeholder={`พิมพ์ "${contact.name}" เพื่อยืนยัน`}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
              />
              <button
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
                disabled={deleteInput !== contact.name}
                onClick={deleteContact}
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
  );
}
