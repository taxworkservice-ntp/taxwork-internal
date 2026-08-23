"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Template = {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  frequency: "monthly" | "quarterly" | "annual";
  day_of_period: number;
  months: number[];
  active: boolean;
  clients: { name: string } | null;
};

const MONTH_NAMES = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const empty = {
  title: "",
  description: "",
  client_id: "",
  frequency: "monthly" as Template["frequency"],
  day_of_period: 15,
  months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  active: true,
};

export default function TemplatesPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const [t, c] = await Promise.all([
      supabase
        .from("task_templates")
        .select("*, clients(name)")
        .order("title"),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    setTemplates(t.data ?? []);
    setClients(c.data ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleMonth(m: number) {
    setForm((f) => ({
      ...f,
      months: f.months.includes(m)
        ? f.months.filter((x) => x !== m).sort((a, b) => a - b)
        : [...f.months, m].sort((a, b) => a - b),
    }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("task_templates").insert({
      ...form,
      description: form.description || null,
      client_id: form.client_id || null,
    });
    setForm(empty);
    setShowForm(false);
    load();
  }

  async function toggleActive(t: Template) {
    await supabase.from("task_templates").update({ active: !t.active }).eq("id", t.id);
    load();
  }

  async function remove(t: Template) {
    if (!confirm(`ลบเทมเพลต "${t.title}" และงานที่สร้างจากเทมเพลตนี้?`)) return;
    await supabase.from("task_templates").delete().eq("id", t.id);
    load();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">เทมเพลตงาน</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "ยกเลิก" : "เพิ่มเทมเพลต"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={add} className="card mb-4 max-w-xl space-y-3">
          <div>
            <label className="label">ชื่องาน * (เช่น ยื่นภาษีมูลค่าเพิ่มรายเดือน)</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">รายละเอียด</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">ความถี่</label>
              <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Template["frequency"] })}>
                <option value="monthly">รายเดือน</option>
                <option value="quarterly">รายไตรมาส</option>
                <option value="annual">รายปี</option>
              </select>
            </div>
            <div>
              <label className="label">ครบกำหนดวันที่</label>
              <input type="number" min={1} max={31} className="input" value={form.day_of_period} onChange={(e) => setForm({ ...form, day_of_period: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">ลูกค้า (ไม่บังคับ)</label>
              <select className="input" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">ทุกลูกค้า</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">
              ใช้บังคับในเดือน ({form.frequency === "monthly" ? "ทุกเดือน" : form.frequency === "quarterly" ? "เดือนเริ่มไตรมาส" : "เดือนเริ่มงาน"})
            </label>
            <div className="flex gap-1">
              {MONTH_NAMES.map((name, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => toggleMonth(i)}
                  className={`rounded border px-2 py-1 text-xs ${
                    form.months.includes(i)
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-neutral-300 text-neutral-400"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary">บันทึก</button>
        </form>
      )}

      <table className="table-base max-w-3xl">
        <thead>
          <tr><th>ชื่องาน</th><th>ความถี่</th><th>วันที่</th><th>ลูกค้า</th><th>เปิดใช้งาน</th><th></th></tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className={t.active ? "" : "opacity-40"}>
              <td>{t.title}</td>
              <td className="capitalize">{t.frequency}</td>
              <td>{t.day_of_period}</td>
              <td>{t.clients?.name ?? "Firm-wide"}</td>
              <td>
                <button className="text-xs underline" onClick={() => toggleActive(t)}>
                  {t.active ? "ใช่" : "ไม่"}
                </button>
              </td>
              <td className="text-right">
                <button className="btn-danger px-1.5 py-0.5 text-xs" onClick={() => remove(t)}>ลบ</button>
              </td>
            </tr>
          ))}
          {!templates.length && (
            <tr><td colSpan={6} className="text-neutral-500">
              No templates yet. Create one like &quot;Monthly VAT filing due day 15&quot; — then use{" "}
              <Link href="/tasks" className="underline">Tasks</Link> to generate instances.
            </td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
