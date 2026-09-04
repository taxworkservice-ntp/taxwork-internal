"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { createContact, listContacts } from "@/lib/actions/contacts";
import CopyButton from "@/components/copy-button";

type Contact = {
  id: string;
  name: string;
  firm: string | null;
  type: "auditor" | "accountant" | "both";
  tax_id: string | null;
  license_no: string | null;
  phone: string | null;
  email: string | null;
};

type SortKey = "name" | "firm" | "type" | "tax_id";

const SORT_STORAGE_KEY = "contacts.sort";

const TYPE_LABELS = {
  auditor: "ผู้สอบบัญชี",
  accountant: "นักบัญชี",
  both: "ผู้สอบบัญชี + นักบัญชี",
} as const;

const emptyForm = {
  name: "",
  firm: "",
  type: "accountant" as Contact["type"],
  tax_id: "",
  license_no: "",
  phone: "",
  email: "",
  line_id: "",
  address: "",
  notes: "",
};

function Cell({ value }: { value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate" title={value}>{value}</span>
      <CopyButton text={value} />
    </span>
  );
}

function Th({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey?: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  if (!sortKey) return <th className={className}>{label}</th>;
  const active = sort.key === sortKey;
  return (
    <th className={className}>
      <button
        className="inline-flex items-center gap-1 uppercase hover:text-neutral-800"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className="text-neutral-400">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved) setSort(JSON.parse(saved));
    } catch {}
  }, []);

  function changeSort(key: SortKey) {
    setSort((prev) => {
      const next =
        prev.key === key
          ? { key, dir: prev.dir === "asc" ? ("desc" as const) : ("asc" as const) }
          : { key, dir: "asc" as const };
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function load() {
    setContacts(await listContacts());
  }

  useEffect(() => {
    load();
     
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await createContact(form);
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  const filtered = contacts.filter((c) =>
    [c.name, c.firm, c.tax_id, c.phone, c.email]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const va = (a[sort.key] ?? "").toLowerCase();
    const vb = (b[sort.key] ?? "").toLowerCase();
    const cmp = va.localeCompare(vb, "th");
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">ผู้เกี่ยวข้อง</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "ยกเลิก" : "เพิ่มผู้เกี่ยวข้อง"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={add} className="card mb-4 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">ชื่อ *</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">บริษัท / สำนักงาน</label>
            <input
              className="input"
              value={form.firm}
              onChange={(e) => setForm({ ...form, firm: e.target.value })}
            />
          </div>
          <div>
            <label className="label">ประเภท</label>
            <select
              className="input"
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as Contact["type"] })
              }
            >
              {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((k) => (
                <option key={k} value={k}>{TYPE_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">เลขผู้เสียภาษี</label>
            <input
              className="input"
              value={form.tax_id}
              onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
            />
          </div>
          <div>
            <label className="label">เลขใบอนุญาต (Audit ID)</label>
            <input
              className="input"
              value={form.license_no}
              onChange={(e) => setForm({ ...form, license_no: e.target.value })}
            />
          </div>
          <div>
            <label className="label">โทรศัพท์</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <button className="btn-primary col-span-2 w-fit">
            บันทึก
          </button>
          <p className="col-span-2 text-xs text-neutral-500">
            มอบหมายลูกค้าและแก้ไขข้อมูลเพิ่มเติมได้ในหน้าของผู้เกี่ยวข้องแต่ละคนหลังบันทึก
          </p>
        </form>
      )}

      <input
        className="input mb-4 max-w-xs"
        placeholder="ค้นหา..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="overflow-x-auto">
      <table className="table-base w-full min-w-[760px] max-w-5xl table-fixed">
        <thead>
          <tr>
            <Th label="ชื่อ" sortKey="name" sort={sort} onSort={changeSort} className="w-[25%]" />
            <Th label="บริษัท/สำนักงาน" sortKey="firm" sort={sort} onSort={changeSort} className="w-[23%]" />
            <Th label="ประเภท" sortKey="type" sort={sort} onSort={changeSort} className="w-[13%]" />
            <Th label="เลขผู้เสียภาษี" sortKey="tax_id" sort={sort} onSort={changeSort} className="w-[18%]" />
            <th className="w-[18%]">เลขใบอนุญาต</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <Fragment key={c.id}>
              <tr className="hover:bg-neutral-50">
                <td className="overflow-hidden"><Cell value={c.name} /></td>
                <td className="overflow-hidden">{c.firm ? <Cell value={c.firm} /> : "—"}</td>
                <td>{TYPE_LABELS[c.type]}</td>
                <td className="overflow-hidden">{c.tax_id ? <Cell value={c.tax_id} /> : "—"}</td>
                <td className="overflow-hidden">{c.license_no ? <Cell value={c.license_no} /> : "—"}</td>
                <td className="text-right">
                  <Link
                    href={`/contacts/${c.id}`}
                    className="text-xs text-blue-600 underline"
                  >
                    เปิด
                  </Link>
                </td>
              </tr>
            </Fragment>
          ))}
          {!sorted.length && (
            <tr>
              <td colSpan={6} className="text-neutral-500">
                ยังไม่มีผู้เกี่ยวข้อง
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}
