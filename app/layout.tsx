import type { Metadata } from "next";
import "./globals.css";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://internal.taxworkaccount.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Taxwork Internal",
  description: "ระบบภายในสำหรับจัดการลูกค้า ไฟล์ และงาน",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
