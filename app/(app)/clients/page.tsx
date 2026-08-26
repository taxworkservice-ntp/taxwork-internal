"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import CopyButton from "@/components/copy-button";

type Client = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

type Credential = {
  id: string;
  label: string;
  username: string | null;
  password: string | null;
};

type SortKey = "name" | "tax_id" | "address";
type SortDir = "asc" | "desc";

const SORT_STORAGE_KEY = "clients.sort";

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
  sort: { key: SortKey; dir: SortDir };
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

export default function ClientsPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", tax_id: "", email: "", phone: "", address: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [credCache, setCredCache] = useState<Record<string, Credential[]>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
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
          ? { key, dir: prev.dir === "asc" ? ("desc" as SortDir) : ("asc" as SortDir) }
          : { key, dir: "asc" as SortDir };
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function load() {
    const { data } = await supabase.from("clients").select("*");
    setClients(data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCredentials = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from("credentials")
      .select("id, label, username, password")
      .eq("client_id", clientId)
      .order("label");
    setCredCache((prev) => ({ ...prev, [clientId]: data ?? [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadCredentials(id);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("clients").insert(form);
    setForm({ name: "", tax_id: "", email: "", phone: "", address: "" });
    setShowForm(false);
    load();
  }

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.tax_id ?? "").includes(search) ||
      (c.address ?? "").toLowerCase().includes(search.toLowerCase())
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
        <h1 className="text-lg font-semibold">ลูกค้า</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "ยกเลิก" : "เพิ่มลูกค้า"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={add} className="card mb-4 grid max-w-xl grid-cols-2 gap-3">
          <div>
            <label className="label">ชื่อบริษัท *</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
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
            <label className="label">อีเมล</label>
            <input
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
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
          <div className="col-span-2">
            <label className="label">ที่อยู่</label>
            <input
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <button className="btn-primary col-span-2">บันทึก</button>
        </form>
      )}

      <input
        className="input mb-4 max-w-xs"
        placeholder="ค้นหาชื่อ เลขภาษี หรือที่อยู่..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="overflow-x-auto">
      <table className="table-base w-full min-w-[760px] max-w-5xl table-fixed">
        <thead>
          <tr>
            <th className="w-8"></th>
            <Th label="ชื่อบริษัท" sortKey="name" sort={sort} onSort={changeSort} className="w-[34%]" />
            <Th label="เลขผู้เสียภาษี" sortKey="tax_id" sort={sort} onSort={changeSort} className="w-[22%]" />
            <Th label="ที่อยู่" sortKey="address" sort={sort} onSort={changeSort} className="w-[30%]" />
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <Fragment key={c.id}>
              <tr
                className="cursor-pointer hover:bg-neutral-50"
                onClick={() => toggleExpand(c.id)}
              >
                <td className="text-neutral-400">{expandedId === c.id ? "▼" : "▶"}</td>
                <td className="overflow-hidden"><Cell value={c.name} /></td>
                <td className="overflow-hidden">{c.tax_id ? <Cell value={c.tax_id} /> : "—"}</td>
                <td className="overflow-hidden">{c.address ? <Cell value={c.address} /> : "—"}</td>
                <td className="whitespace-nowrap">
                  <Link
                    href={`/clients/${c.id}`}
                    className="text-xs text-blue-600 underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    เปิด
                  </Link>
                </td>
              </tr>

              {/* Expanded credentials */}
              {expandedId === c.id && (
                <tr>
                  <td colSpan={5} className="bg-neutral-50 p-4">
                    {(credCache[c.id]?.length ?? 0) === 0 ? (
                      <p className="text-sm text-neutral-500">
                        ยังไม่มีข้อมูลเข้าระบบ{" "}
                        <Link href={`/clients/${c.id}`} className="text-blue-600 underline">
                          เปิดหน้าลูกค้า
                        </Link>{" "}
                        เพื่อเพิ่มข้อมูล
                      </p>
                    ) : (
                      <div className="overflow-x-auto"><table className="table-base w-full min-w-[480px] bg-white">
                        <thead>
                          <tr><th>แพลตฟอร์ม</th><th>ผู้ใช้</th><th>รหัสผ่าน</th></tr>
                        </thead>
                        <tbody>
                          {credCache[c.id].map((cr) => (
                            <tr key={cr.id}>
                              <td>{cr.label}</td>
                              <td>
                                {cr.username ? <Cell value={cr.username} /> : "—"}
                              </td>
                              <td className="whitespace-nowrap">
                                <span className="mr-2 inline-flex items-center font-mono text-xs">
                                  {cr.password || "—"}
                                </span>
                                {cr.password && <CopyButton text={cr.password} />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!sorted.length && (
            <tr>
              <td colSpan={5} className="text-neutral-500">ยังไม่มีลูกค้า</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}
