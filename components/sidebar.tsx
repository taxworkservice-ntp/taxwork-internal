"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { navLinks } from "@/lib/nav";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  // Order: home, clients, files, reports, wht, tools, express-backup, contacts.
  // Desktop shows 5 main links; mobile shows 4 (home, clients, files, reports).
  const desktopLinks = navLinks.slice(0, 5);
  const desktopOverflow = navLinks.slice(5);
  const mobileLinks = navLinks.slice(0, 4);
  const mobileOverflow = navLinks.slice(4);
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
      <aside className="sticky top-0 hidden h-screen w-44 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 md:flex print:hidden">
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
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
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
