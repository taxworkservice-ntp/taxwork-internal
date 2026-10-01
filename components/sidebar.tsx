"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

const links = [
  {
    href: "/clients",
    label: "ลูกค้า",
    mobileLabel: "ลูกค้า",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/files",
    label: "ไฟล์",
    mobileLabel: "ไฟล์",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    ),
  },
  {
    href: "/reports",
    label: "รายงานรายเดือน",
    mobileLabel: "รายงาน",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 17v-3M12 17v-5M16 17v-2" />
      </svg>
    ),
  },
  {
    href: "/wht",
    label: "หัก ณ ที่จ่าย",
    mobileLabel: "หัก ณ ที่จ่าย",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 15l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/tools",
    label: "เครื่องมือ",
    mobileLabel: "เครื่องมือ",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14.5 12l-2.5-2.5z" />
      </svg>
    ),
  },
  {
    href: "/express-backup",
    label: "สำรอง Express",
    mobileLabel: "สำรอง",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    ),
  },
  {
    href: "/contacts",
    label: "ผู้เกี่ยวข้อง",
    mobileLabel: "ผู้เกี่ยวข้อง",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="2" y="5" width="20" height="15" rx="2" />
        <circle cx="9" cy="11" r="2.2" />
        <path d="M4.5 17c.7-1.8 2.5-2.8 4.5-2.8s3.8 1 4.5 2.8M16 9h4M16 13h4" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  // Order: clients, files, reports, wht, tools, express-backup, contacts.
  // Desktop shows 5 main links; mobile shows 4 (WHT instead of Tools).
  const desktopLinks = links.slice(0, 5);
  const desktopOverflow = links.slice(5);
  const mobileLinks = links.slice(0, 4);
  const mobileOverflow = links.slice(4);
  const isDesktopOverflowActive = desktopOverflow.some((l) => isActive(l.href));
  const isMobileOverflowActive = mobileOverflow.some((l) => isActive(l.href));

  // Close popover on navigation
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Close popover on Escape
  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  async function signOut() {
    if (!confirm("ต้องการออกจากระบบใช่หรือไม่?")) return;
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-44 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 md:flex">
        <div className="mb-6 text-sm font-bold">Taxwork</div>
        {moreOpen && (
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
        )}
        <nav className="flex flex-col gap-1">
          {desktopLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded px-2 py-2 text-sm hover:bg-neutral-100 ${
                isActive(l.href) ? "bg-neutral-100 font-medium" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={`flex w-full items-center justify-between rounded px-2 py-2 text-sm hover:bg-neutral-100 ${
                isDesktopOverflowActive || moreOpen ? "bg-neutral-100 font-medium" : ""
              }`}
            >
              เพิ่มเติม
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute left-full top-0 z-50 ml-1 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
              >
                {desktopOverflow.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-neutral-100 ${
                      isActive(l.href) ? "font-medium text-blue-600" : "text-neutral-700"
                    }`}
                  >
                    {l.icon}
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
        <button onClick={signOut} className="btn mt-auto text-left text-neutral-500">
          ออกจากระบบ
        </button>
      </aside>

      {/* Mobile bottom nav: 4 icons + overflow */}
      {moreOpen && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-transparent md:hidden"
        />
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {mobileLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
              isActive(l.href) ? "text-blue-600" : "text-neutral-500"
            }`}
          >
            {l.icon}
            {l.mobileLabel}
          </Link>
        ))}
        <div className="relative flex flex-1">
          <button
            onClick={() => setMoreOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="เมนูเพิ่มเติม"
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
              isMobileOverflowActive || moreOpen ? "text-blue-600" : "text-neutral-500"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
            เพิ่มเติม
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute bottom-full right-1 mb-2 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
            >
              {mobileOverflow.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-neutral-100 ${
                    isActive(l.href) ? "font-medium text-blue-600" : "text-neutral-700"
                  }`}
                >
                  {l.icon}
                  {l.label}
                </Link>
              ))}
              <div className="border-t border-neutral-100" />
              <button
                onClick={signOut}
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-neutral-500 hover:bg-neutral-100 active:text-red-600"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
