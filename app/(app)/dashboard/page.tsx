import { getDashboard } from "@/lib/actions/tasks";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { overdue, upcoming, activeClients } = await getDashboard();

  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">แดชบอร์ด</h1>

      <div className="mb-6 flex flex-wrap gap-3 text-sm text-neutral-600">
        <div className="card">ลูกค้าที่ใช้งาน: {activeClients}</div>
        <div className="card text-red-600">เกินกำหนด: {overdue.length}</div>
        <div className="card">ครบกำหนดใน 14 วัน: {upcoming.length}</div>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 font-medium text-red-600">เกินกำหนด</h2>
        {overdue.length ? (
          <table className="table-base">
            <thead>
              <tr><th>กำหนดส่ง</th><th>งาน</th><th>ลูกค้า</th></tr>
            </thead>
            <tbody>
              {overdue.map((t) => (
                <tr key={t.id}>
                  <td className="text-red-600">{t.due_date}</td>
                  <td>{t.title}</td>
                  <td>{t.clients ? t.clients.name : "—"}</td>
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
        {upcoming.length ? (
          <table className="table-base">
            <thead>
              <tr><th>กำหนดส่ง</th><th>งาน</th><th>ลูกค้า</th></tr>
            </thead>
            <tbody>
              {upcoming.map((t) => (
                <tr key={t.id}>
                  <td>{t.due_date}</td>
                  <td>{t.title}</td>
                  <td>{t.clients ? t.clients.name : "—"}</td>
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
