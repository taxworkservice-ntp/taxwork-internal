# ติดตั้ง Express Backup (1 ไฟล์ — 2 นาที)

1. แตก ZIP → คลิกขวา `TaxworkExpressBackupAgent.exe` → **Run as administrator**
2. หน้าต่างลงทะเบียนจะเปิดเอง → เปิดเว็บ `Express Backup → เพิ่มเครื่อง`
3. วาง **รหัสเครื่อง** + **รหัสลงทะเบียน** → กด **ลงทะเบียนและเริ่มเลย**
4. ขึ้น `สำเร็จ! เครื่องออนไลน์แล้ว` = เสร็จ (เปิดเองทุกครั้งที่เปิดเครื่อง)

ดูสถานะที่เว็บ: `● ออนไลน์` + `เห็นล่าสุด` อัปเดต
ไฟล์อยู่ที่ `%LOCALAPPDATA%\TaxworkExpressBackup\` (log: `agent.log`)
ถ้าเปลี่ยนเครื่อง: ลบ Task `TaxworkExpressBackup` ใน Task Scheduler แล้วลงใหม่
