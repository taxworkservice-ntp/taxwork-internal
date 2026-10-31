import Link from "next/link";
import PageHeader from "@/components/page-header";
import { listFiles } from "@/lib/actions/files";
import { navLinks } from "@/lib/nav";
import HomeUpload from "./home-upload";

export const dynamic = "force-dynamic";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const DOC_EXT = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

function fmtSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fmtDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fileBadge(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    return { label: "PDF", className: "border-red-200 bg-red-50 text-red-700" };
  }
  if (IMAGE_EXT.has(ext)) {
    return { label: "IMG", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (DOC_EXT.has(ext)) {
    return { label: "DOC", className: "border-blue-200 bg-blue-50 text-blue-700" };
  }
  return { label: "FILE", className: "border-neutral-200 bg-neutral-50 text-neutral-600" };
}

function primaryAccent(href: string) {
  return href === "/clients"
    ? "bg-blue-50 text-blue-700 group-hover:bg-blue-100"
    : "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100";
}

export default async function HomePage() {
  const files = await listFiles();
  const recent = files.slice(0, 6);
  const primary = navLinks.filter((link) => link.href === "/clients" || link.href === "/files");
  const secondary = navLinks.filter(
    (link) => link.href !== "/" && link.href !== "/clients" && link.href !== "/files"
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="หน้าแรก"
        subtitle="อัปโหลดไฟล์ด่วนและเข้าถึงงานที่ใช้บ่อย"
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden p-0 lg:col-span-2">
          <div className="border-b border-neutral-100 bg-gradient-to-r from-blue-50 via-blue-50/60 to-white px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M12 16V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">อัปโหลดไฟล์ด่วน</h2>
                <p className="text-xs text-neutral-500">ไฟล์จะถูกเก็บไว้ในคลังไฟล์ทั่วไป</p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <HomeUpload />
            <p className="mt-3 text-xs text-neutral-400">
              หลังอัปโหลดแล้ว ไฟล์จะแสดงในรายการไฟล์ล่าสุดด้านล่าง
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {primary.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card group flex flex-col justify-between gap-5 p-5 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${primaryAccent(
                    link.href
                  )}`}
                >
                  {link.icon}
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="text-neutral-300 transition-colors group-hover:text-blue-500"
                  aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">{link.label}</h2>
                <p className="mt-1 text-xs leading-snug text-neutral-500">{link.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-neutral-900">เมนูลัด</h2>
          <p className="text-xs text-neutral-500">เข้าถึงเครื่องมือที่ใช้บ่อย</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {secondary.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card group flex items-start gap-3 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 transition-colors group-hover:bg-blue-100 group-hover:text-blue-700">
                {link.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-neutral-800">{link.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-neutral-500">
                  {link.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">ไฟล์ล่าสุด</h2>
              <p className="text-xs text-neutral-500">ไฟล์ทั่วไปที่อัปโหลดล่าสุด</p>
            </div>
            <Link href="/files" className="btn inline-flex items-center gap-1.5">
              ดูไฟล์ทั้งหมด
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>

          {recent.length ? (
            <ul className="divide-y divide-neutral-100">
              {recent.map((file) => {
                const badge = fileBadge(file.file_name);
                return (
                  <li key={file.id}>
                    <Link
                      href="/files"
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-neutral-50"
                    >
                      <span
                        className={`flex h-8 w-10 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-800">
                          {file.file_name}
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {fmtSize(file.size_bytes)} · {fmtDate(file.uploaded_at)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">เปิดในไฟล์ →</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-neutral-500">ยังไม่มีไฟล์</p>
              <p className="mt-1 text-xs text-neutral-400">อัปโหลดไฟล์แรกได้จากกล่องด้านบน</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
