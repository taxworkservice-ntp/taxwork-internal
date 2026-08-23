import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [overdue, upcoming] = await Promise.all([
    supabase
      .from("task_instances")
      .select("id, title, due_date, status, client_id, clients(name)")
      .in("status", ["todo", "in_progress"])
      .lt("due_date", today)
      .order("due_date"),
    supabase
      .from("task_instances")
      .select("id, title, due_date, status, client_id, clients(name)")
      .in("status", ["todo", "in_progress"])
      .gte("due_date", today)
      .lte("due_date", in14)
      .order("due_date"),
  ]);

  const { data: clients } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">แดชบอร์ด</h1>

      <div className="mb-6 flex flex-wrap gap-3 text-sm text-neutral-600">
        <div className="card">ลูกค้าที่ใช้งาน: {clients?.length ?? 0}</div>
        <div className="card text-red-600">เกินกำหนด: {overdue.data?.length ?? 0}</div>
        <div className="card">ครบกำหนดใน 14 วัน: {upcoming.data?.length ?? 0}</div>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 font-medium text-red-600">เกินกำหนด</h2>
        {overdue.data?.length ? (
          <table className="table-base">
            <thead>
              <tr><th>กำหนดส่ง</th><th>งาน</th><th>ลูกค้า</th></tr>
            </thead>
            <tbody>
              {overdue.data.map((t) => (
                <tr key={t.id}>
                  <td className="text-red-600">{t.due_date}</td>
                  <td>{t.title}</td>
                  <td>{t.clients ? ((t.clients as unknown as { name: string })).name : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-500">ไม่มีงานเกินกำหนด</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">ภายใน 14 วันข้างหน้า</h2>
        {upcoming.data?.length ? (
          <table className="table-base">
            <thead>
              <tr><th>กำหนดส่ง</th><th>งาน</th><th>ลูกค้า</th></tr>
            </thead>
            <tbody>
              {upcoming.data.map((t) => (
                <tr key={t.id}>
                  <td>{t.due_date}</td>
                  <td>{t.title}</td>
                  <td>{t.clients ? ((t.clients as unknown as { name: string })).name : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-500">ไม่มีงานครบกำหนดเร็วนี้</p>
        )}
        <p className="mt-3 text-xs text-neutral-400">
          งานจะถูกสร้างอัตโนมัติเมื่อเข้าหน้า{" "}
          <Link href="/tasks" className="underline">งาน</Link>
        </p>
      </section>
    </>
  );
}
