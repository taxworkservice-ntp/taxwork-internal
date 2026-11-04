import Link from "next/link";
import PageHeader from "@/components/page-header";
import {
  listDownloadedFileIds,
  listFiles,
  listUploaderNames,
} from "@/lib/actions/files";
import {
  sortUndownloadedFirst,
  splitUploads,
  type HomeUploadFile,
} from "@/lib/home-uploads";
import { navLinks } from "@/lib/nav";
import { requireUser } from "@/lib/session";
import HomeUpload from "./home-upload";
import UploadHistory from "./upload-history";

export const dynamic = "force-dynamic";

function primaryAccent(href: string) {
  return href === "/clients"
    ? "bg-blue-50 text-blue-700 group-hover:bg-blue-100"
    : "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100";
}

export default async function HomePage() {
  const user = await requireUser();
  const files = await listFiles();
  const uploaderNames = await listUploaderNames();
  const downloadedIds = await listDownloadedFileIds();

  const homeFiles: HomeUploadFile[] = files.map((file) => ({
    id: file.id,
    file_name: file.file_name,
    storage_path: file.storage_path,
    size_bytes: file.size_bytes,
    uploaded_at: file.uploaded_at,
    uploaded_by: file.uploaded_by,
  }));

  const downloadedSet = new Set(downloadedIds);
  const { mine, team } = splitUploads(homeFiles, user.email ?? "");
  const teamRemaining = team.filter((file) => !downloadedSet.has(file.id)).length;
  const mineRecent = mine.slice(0, 4);
  const teamRecent = sortUndownloadedFirst(team, downloadedSet).slice(0, 4);
  const primary = navLinks.filter((link) => link.href === "/clients" || link.href === "/files");
  const secondary = navLinks.filter(
    (link) => link.href !== "/" && link.href !== "/clients" && link.href !== "/files"
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="หน้าแรก"
        subtitle="อัปโหลดและดาวน์โหลดไฟล์ได้ในไม่กี่ขั้นตอน"
      />

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 16V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-neutral-900">อัปโหลดไฟล์</h2>
            <p className="text-xs text-neutral-500">
              เลือกไฟล์จากเครื่อง แล้วไฟล์จะแสดงด้านล่างทันที
            </p>
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-2xl">
          <HomeUpload />
        </div>

        <p className="mt-3 text-center text-xs text-neutral-400">
          อัปโหลดได้หลายไฟล์พร้อมกัน · ไฟล์จะแสดงในรายการด้านล่างทันที
        </p>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-neutral-900">ไฟล์ล่าสุด</h2>
          <p className="text-xs text-neutral-500">
            ดาวน์โหลดไฟล์จากทีม หรือไฟล์ที่คุณอัปโหลด
          </p>
        </div>
        <UploadHistory
          mine={mineRecent}
          team={teamRecent}
          mineCount={mine.length}
          teamCount={team.length}
          teamRemaining={teamRemaining}
          initialDownloadedIds={downloadedIds}
          uploaderNames={uploaderNames}
        />
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-neutral-900">เมนูหลัก</h2>
          <p className="text-xs text-neutral-500">ไปยังหน้าลูกค้าและไฟล์ทั้งหมด</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {primary.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card group flex items-center gap-4 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${primaryAccent(
                  link.href
                )}`}
              >
                {link.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-900">{link.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-neutral-500">
                  {link.description}
                </span>
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="shrink-0 text-neutral-300 transition-colors group-hover:text-blue-500"
                aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </div>
      </section>

      <section>
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
    </div>
  );
}
