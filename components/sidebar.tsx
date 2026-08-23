"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="flex h-screen w-44 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
      <div className="mb-6 text-sm font-bold">Taxwork</div>
      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded px-2 py-1.5 text-sm hover:bg-neutral-100 ${
              isActive(l.href) ? "bg-neutral-100 font-medium" : ""
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <button onClick={signOut} className="btn mt-auto text-left text-neutral-500">
        ออกจากระบบ
      </button>
    </aside>
  );
}
