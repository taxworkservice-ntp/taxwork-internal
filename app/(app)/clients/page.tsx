"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient, deleteClient, listClients, listCredentials } from "@/lib/actions/clients";
import CopyButton from "@/components/copy-button";
import PageHeader from "@/components/page-header";
import SearchInput from "@/components/search-input";
import EmptyState from "@/components/empty-state";
import Badge from "@/components/badge";
import ClientAvatar from "@/components/client-avatar";
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
  avatar_text: string | null;
  avatar_color: string | null;
  created_at: string;
};

type Credential = {
  id: string;
  label: string;
  username: string | null;
  password: string | null;
};

type SortKey = "name" | "tax_id" | "created_at";
type SortDir = "asc" | "desc";

const SORT_STORAGE_KEY = "clients.sort";

const SORT_LABELS: Record<SortKey, string> = {
  name: "ชื่อ (ก-ฮ)",
  tax_id: "เลขผู้เสียภาษี",
  created_at: "วันที่เพิ่ม",
};

const emptyForm = { name: "", tax_id: "", email: "", phone: "", address: "" };

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cell({ value }: { value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate" title={value}>{value}</span>
      <CopyButton text={value} />
    </span>
  );
}

function statusInfo(status: string): { tone: "success" | "neutral"; label: string } {
  return status === "active"
    ? { tone: "success", label: "ใช้งาน" }
    : { tone: "neutral", label: "เก็บถาวร" };
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [credCache, setCredCache] = useState<Record<string, Credential[]>>({});
  const [credLoading, setCredLoading] = useState<Record<string, boolean>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("clients.favorites") ?? "[]");
    } catch {
      return [];
    }
  });
  const [onlyFav, setOnlyFav] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    localStorage.setItem("clients.favorites", JSON.stringify(favorites));
  }, [favorites]);

  function toggleFav(id: string) {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { key: SortKey; dir: SortDir };
        if (parsed.key in SORT_LABELS) setSort(parsed);
      }
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

  const load = useCallback(async () => {
    setClients(await listClients());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadCredentials = useCallback(async (clientId: string) => {
    setCredLoading((prev) => ({ ...prev, [clientId]: true }));
    try {
      const creds = await listCredentials(clientId);
      setCredCache((prev) => ({ ...prev, [clientId]: creds }));
    } catch {
      setCredCache((prev) => ({ ...prev, [clientId]: [] }));
    } finally {
      setCredLoading((prev) => ({ ...prev, [clientId]: false }));
    }
  }, []);

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (credCache[id] === undefined) loadCredentials(id);
    }
  }

  function cancelForm() {
    setForm(emptyForm);
    setFormError("");
    setShowForm(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError("");
    try {
      await createClient(form);
      setForm(emptyForm);
      setShowForm(false);
      await load();
      push({ type: "success", message: `เพิ่มลูกค้า "${form.name}" แล้ว` });
    } catch {
      setFormError("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(c: Client) {
    setConfirmingId(null);
    try {
      await deleteClient(c.id);
      await load();
      push({ type: "success", message: `ลบ "${c.name}" แล้ว` });
    } catch {
      push({ type: "error", message: `ลบ "${c.name}" ไม่สำเร็จ` });
    }
  }

  const filtered = clients.filter((c) => {
    if (onlyFav && !favorites.includes(c.id)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.tax_id, c.email, c.phone, c.address].some((v) =>
      (v ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const fa = favorites.includes(a.id) ? 0 : 1;
    const fb = favorites.includes(b.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    let cmp: number;
    if (sort.key === "created_at") {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else {
      cmp = (a[sort.key] ?? "").toLowerCase().localeCompare((b[sort.key] ?? "").toLowerCase(), "th");
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <>
      <PageHeader
        title="ลูกค้า"
        subtitle="จัดการข้อมูลลูกค้า ข้อมูลเข้าระบบ และงาน"
        meta={
          !loading ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
              ทั้งหมด {clients.length} ราย
            </span>
          ) : null
        }
        actions={
          <button
            className="btn-primary inline-flex items-center gap-2 px-4 py-2"
            onClick={() => (showForm ? cancelForm() : setShowForm(true))}
          >
            {!showForm && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v10M3 8h10" strokeLinecap="round" />
              </svg>
            )}
            {showForm ? "ยกเลิก" : "เพิ่มลูกค้า"}
          </button>
        }
      />

      {showForm && (
        <form onSubmit={add} className="card animate-fade-in mb-5">
          <h2 className="mb-4 font-medium">เพิ่มลูกค้าใหม่</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">ข้อมูลบริษัท</h3>
            </div>
            <div>
              <label className="label">ชื่อบริษัท *</label>
              <input
                className="input"
                required
                autoFocus
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
            <div className="sm:col-span-2">
              <h3 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">ข้อมูลติดต่อ</h3>
            </div>
            <div>
              <label className="label">อีเมล</label>
              <input
                className="input"
                type="email"
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
            <div className="sm:col-span-2">
              <label className="label">ที่อยู่</label>
              <input
                className="input"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          {formError && (
            <p className="mt-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{formError}</p>
          )}
          <div className="mt-4 flex items-center gap-2">
            <button className="btn-primary" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button type="button" className="btn" onClick={cancelForm} disabled={submitting}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ค้นหาชื่อ เลขภาษี อีเมล โทรศัพท์ หรือที่อยู่..."
        />
        <select
          className="input w-auto"
          value={sort.key}
          onChange={(e) => changeSort(e.target.value as SortKey)}
          aria-label="เรียงตาม"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>เรียงตาม: {SORT_LABELS[k]}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => changeSort(sort.key)}
          title={sort.dir === "asc" ? "น้อยไปมาก" : "มากไปน้อย"}
        >
          {sort.dir === "asc" ? "↑" : "↓"}
        </button>
        <button
          type="button"
          className={onlyFav ? "btn-primary px-2 py-1 text-xs" : "btn px-2 py-1 text-xs"}
          onClick={() => setOnlyFav((v) => !v)}
          title="แสดงเฉพาะลูกค้าที่ติดดาว"
        >
          ★ รายการโปรด
        </button>
      </div>

      {!loading && (
        <p className="mb-2 text-xs text-neutral-500">
          {search.trim() ? `พบ ${sorted.length} ราย` : `แสดง ${sorted.length} ราย`}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="table-base w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="w-10"></th>
              <th className="w-8"></th>
              <th>ลูกค้า</th>
              <th className="w-56">ติดต่อ</th>
              <th className="w-28">สถานะ</th>
              <th className="w-44"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="py-14 text-center text-sm text-neutral-400">กำลังโหลด...</td>
              </tr>
            )}

            {!loading &&
              sorted.map((c) => {
                const expanded = expandedId === c.id;
                const st = statusInfo(c.status);
                const creds = credCache[c.id] ?? [];
                return (
                  <Fragment key={c.id}>
                    <tr className={expanded ? "bg-blue-50/40" : "hover:bg-neutral-50"}>
                      <td className="text-neutral-400">
                        <button
                          type="button"
                          aria-label="รายละเอียดลูกค้า"
                          aria-expanded={expanded}
                          className="rounded p-1 hover:text-neutral-700"
                          onClick={() => toggleExpand(c.id)}
                        >
                          <Chevron open={expanded} />
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={
                            favorites.includes(c.id)
                              ? "text-lg leading-none text-yellow-500"
                              : "text-lg leading-none text-neutral-300 hover:text-yellow-500"
                          }
                          onClick={() => toggleFav(c.id)}
                          aria-label={
                            favorites.includes(c.id)
                              ? "เอาออกจากรายการโปรด"
                              : "ติดดาวเป็นรายการโปรด"
                          }
                          title={
                            favorites.includes(c.id)
                              ? "เอาออกจากรายการโปรด"
                              : "ติดดาวเป็นรายการโปรด"
                          }
                        >
                          ★
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <ClientAvatar
                            name={c.name}
                            text={c.avatar_text}
                            color={c.avatar_color}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <Link href={`/clients/${c.id}`} className="font-medium text-blue-700 hover:underline">
                              {c.name}
                            </Link>
                            <div className="mt-0.5 text-xs text-neutral-500">
                              {c.tax_id ? `เลขภาษี ${c.tax_id}` : "ยังไม่มีเลขผู้เสียภาษี"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-0.5 text-sm">
                          {c.phone ? (
                            <a href={`tel:${c.phone}`} className="text-blue-600 hover:underline">{c.phone}</a>
                          ) : null}
                          {c.email ? (
                            <a href={`mailto:${c.email}`} className="truncate text-blue-600 hover:underline">{c.email}</a>
                          ) : null}
                          {!c.phone && !c.email && <span className="text-neutral-400">—</span>}
                        </div>
                      </td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="text-right">
                        {confirmingId === c.id ? (
                          <InlineConfirm
                            message="ลบลูกค้ารายนี้?"
                            confirmLabel="ลบถาวร"
                            onConfirm={() => remove(c)}
                            onCancel={() => setConfirmingId(null)}
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Link className="btn px-2 py-1 text-xs" href={`/clients/${c.id}`}>
                              เปิด
                            </Link>
                            <button
                              type="button"
                              className="btn-danger px-2 py-1 text-xs"
                              onClick={() => setConfirmingId(c.id)}
                            >
                              ลบ
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>

                    {expanded && (
                      <tr className="bg-neutral-50/70">
                        <td></td>
                        <td colSpan={5} className="pb-4">
                          <div className="mb-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                            <div>
                              <div className="text-xs text-neutral-500">ชื่อ</div>
                              <Cell value={c.name} />
                            </div>
                            <div>
                              <div className="text-xs text-neutral-500">เลขผู้เสียภาษี</div>
                              {c.tax_id ? <Cell value={c.tax_id} /> : <span className="text-neutral-400">—</span>}
                            </div>
                            <div>
                              <div className="text-xs text-neutral-500">โทรศัพท์</div>
                              {c.phone ? <Cell value={c.phone} /> : <span className="text-neutral-400">—</span>}
                            </div>
                            <div className="sm:col-span-2">
                              <div className="text-xs text-neutral-500">อีเมล</div>
                              {c.email ? <Cell value={c.email} /> : <span className="text-neutral-400">—</span>}
                            </div>
                            <div>
                              <div className="text-xs text-neutral-500">สถานะ</div>
                              <Badge tone={st.tone}>{st.label}</Badge>
                            </div>
                            <div className="sm:col-span-3">
                              <div className="text-xs text-neutral-500">ที่อยู่</div>
                              {c.address ? <Cell value={c.address} /> : <span className="text-neutral-400">—</span>}
                            </div>
                            {c.notes && (
                              <div className="sm:col-span-3">
                                <div className="text-xs text-neutral-500">หมายเหตุ</div>
                                <Cell value={c.notes} />
                              </div>
                            )}
                          </div>

                          <h3 className="mb-2 text-sm font-medium">ข้อมูลเข้าระบบ</h3>
                          {credLoading[c.id] ? (
                            <div className="space-y-2">
                              {[0, 1].map((i) => (
                                <div key={i} className="h-8 animate-pulse rounded bg-neutral-200/70" />
                              ))}
                            </div>
                          ) : creds.length === 0 ? (
                            <p className="text-sm text-neutral-500">
                              ยังไม่มีข้อมูลเข้าระบบ{" "}
                              <Link href={`/clients/${c.id}`} className="text-blue-600 underline">
                                เปิดหน้าลูกค้า
                              </Link>{" "}
                              เพื่อเพิ่มข้อมูล
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="table-base w-full min-w-[480px] bg-white">
                                <thead>
                                  <tr>
                                    <th>แพลตฟอร์ม</th>
                                    <th>ผู้ใช้</th>
                                    <th>รหัสผ่าน</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {creds.map((cr) => (
                                    <tr key={cr.id}>
                                      <td>{cr.label}</td>
                                      <td>{cr.username ? <Cell value={cr.username} /> : "—"}</td>
                                      <td><PasswordValue value={cr.password} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

            {!loading && !sorted.length && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title={
                      onlyFav && !search.trim()
                        ? "ยังไม่มีรายการโปรด"
                        : search.trim()
                          ? "ไม่พบลูกค้าที่ค้นหา"
                          : "ยังไม่มีลูกค้า"
                    }
                    hint={
                      onlyFav && !search.trim()
                        ? "กด ★ ที่ลูกค้าที่ใช้บ่อยเพื่อปักไว้ด้านบน"
                        : search.trim()
                          ? "ลองเปลี่ยนคำค้นหา"
                          : "เริ่มจากเพิ่มลูกค้าด้านบน"
                    }
                    action={
                      !search.trim() && !onlyFav ? (
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                          เพิ่มลูกค้า
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
