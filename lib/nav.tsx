import type { ReactNode } from "react";

export type NavLink = {
  href: string;
  label: string;
  mobileLabel: string;
  description: string;
  icon: ReactNode;
};

export const navLinks: NavLink[] = [
  {
    href: "/",
    label: "หน้าแรก",
    mobileLabel: "หน้าแรก",
    description: "ภาพรวมและอัปโหลดไฟล์ด่วน",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.5 21v-6h5v6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/clients",
    label: "ลูกค้า",
    mobileLabel: "ลูกค้า",
    description: "จัดการรายชื่อและข้อมูลลูกค้า",
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
    description: "อัปโหลดและค้นหาไฟล์ทั้งหมด",
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
    description: "สร้างและส่งรายงานรายเดือน",
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
    description: "ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย",
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
    description: "รวมเครื่องมือจัดการไฟล์ PDF",
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
    description: "สำรองและกู้คืนข้อมูล Express",
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
    description: "ผู้สอบบัญชีและนักบัญชีที่เกี่ยวข้อง",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="2" y="5" width="20" height="15" rx="2" />
        <circle cx="9" cy="11" r="2.2" />
        <path d="M4.5 17c.7-1.8 2.5-2.8 4.5-2.8s3.8 1 4.5 2.8M16 9h4M16 13h4" />
      </svg>
    ),
  },
  {
    href: "/onboarding",
    label: "จดทะเบียนบริษัท",
    mobileLabel: "จดทะเบียน",
    description: "รับข้อมูลจดทะเบียนบริษัทจากลูกค้า",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </svg>
    ),
  },
];
