"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { generateDueTasks } from "@/lib/tasks";

type Task = {
  id: string;
  title: string;
  period_label: string;
  due_date: string;
  status: string;
  client_id: string | null;
  clients: { name: string } | null;
};

const STATUSES = ["todo", "in_progress", "done", "skipped"] as const;

const STATUS_LABELS = {
  todo: "รอทำ",
  in_progress: "กำลังทำ",
  done: "เสร็จแล้ว",
  skipped: "ข้าม",
} as const;

export default function TasksPage() {
  const supabase = createClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [generating, setGenerating] = useState(false);
  const year = now.getFullYear() + Math.floor(month / 12);
  const normMonth = ((month % 12) + 12) % 12;

  const load = useCallback(async () => {
    const first = new Date(year, normMonth, 1);
    const last = new Date(year, normMonth + 1, 0);
    const { data } = await supabase
      .from("task_instances")
      .select("*, clients(name)")
      .gte("due_date", `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`)
      .lte("due_date", `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${last.getDate()}`)
      .order("due_date");
    setTasks(data ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, normMonth]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    await generateDueTasks();
    setGenerating(false);
    load();
  }

  async function cycleStatus(task: Task) {
    const idx = (STATUSES as readonly string[]).indexOf(task.status);
    const next = STATUSES[(idx + 1) % STATUSES.length];
    await supabase
      .from("task_instances")
      .update({
        status: next,
        completed_at: next === "done" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    load();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">งาน</h1>
        <button className="btn" onClick={() => setMonth(month - 1)}>←</button>
        <span className="w-32 text-center text-sm font-medium">
          {new Date(2026, normMonth, 1).toLocaleDateString("th-TH", { month: "long" })}{" "}
          {new Date(year, normMonth, 1).toLocaleDateString("th-TH", { year: "numeric" })}
        </span>
        <button className="btn" onClick={() => setMonth(month + 1)}>→</button>
        <div className="flex-grow" />
        <Link href="/tasks/templates" className="btn">จัดการเทมเพลต</Link>
        <button className="btn-primary" onClick={generate} disabled={generating}>
          {generating ? "กำลังสร้าง..." : "สร้างงาน"}
        </button>
      </div>

      <p className="mb-4 text-xs text-neutral-500">
        คลิกที่สถานะเพื่อเปลี่ยน • วันครบกำหนดสีแดง = เกินกำหนด
      </p>

      <table className="table-base max-w-2xl">
        <thead>
          <tr><th>กำหนดส่ง</th><th>งาน</th><th>ลูกค้า</th><th>สถานะ</th></tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td className={t.due_date < today && t.status !== "done" ? "text-red-600" : ""}>
                {t.due_date}
              </td>
              <td>{t.title}</td>
              <td>
                {t.clients ? (
                  <Link href={`/clients/${t.client_id}`} className="text-blue-600 underline">
                    {t.clients.name}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <button
                  onClick={() => cycleStatus(t)}
                  className={`rounded border px-2 py-0.5 text-xs ${
                    t.status === "done"
                      ? "border-green-300 bg-green-50 text-green-700"
                      : t.status === "in_progress"
                        ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                        : t.status === "skipped"
                          ? "text-neutral-400"
                          : ""
                  }`}
                >
                  {STATUS_LABELS[t.status as keyof typeof STATUS_LABELS]}
                </button>
              </td>
            </tr>
          ))}
          {!tasks.length && (
            <tr><td colSpan={4} className="text-neutral-500">
              ไม่มีงานในเดือนนี้ กด &quot;สร้างงาน&quot; หรือเพิ่มเทมเพลต
            </td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
