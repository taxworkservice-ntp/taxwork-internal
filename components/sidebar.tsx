"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/clients", label: "ลูกค้า" },
  { href: "/files", label: "ไฟล์" },
  { href: "/contacts", label: "ผู้เกี่ยวข้อง" },
  { href: "/tools", label: "เครื่องมือ" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 border-b border-neutral-200 bg-white px-3 md:hidden">
        <button
          aria-label="เมนู"
          className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-neutral-100"
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
        <span className="text-sm font-bold">Taxwork</span>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar: drawer on mobile, fixed column on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 shrink-0 transform flex-col border-r border-neutral-200 bg-white p-4 transition-transform duration-200 md:sticky md:top-0 md:h-screen md:w-44 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-bold">Taxwork</span>
          <button
            aria-label="ปิดเมนู"
            className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 md:hidden"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((l) => (
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
        </nav>
        <button
          onClick={signOut}
          className="btn mt-auto text-left text-neutral-500"
        >
          ออกจากระบบ
        </button>
      </aside>
    </>
  );
}
