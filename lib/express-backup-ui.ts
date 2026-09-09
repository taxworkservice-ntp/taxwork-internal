// Client-safe Express Backup UI constants.
// This module has NO Node/DB imports — safe for "use client" components.
// Server code (lib/express-backup.ts) re-exports these to keep one definition.

export type ExpressBackupStatus =
  | "healthy"
  | "pending"
  | "running"
  | "late"
  | "failed"
  | "unconfigured";

export const BACKUP_ERROR_TH: Record<string, string> = {
  SOURCE_NOT_FOUND: "ไม่พบโฟลเดอร์ข้อมูล Express",
  ACCESS_DENIED: "ไม่มีสิทธิ์เข้าถึงโฟลเดอร์ข้อมูล",
  DISK_FULL: "พื้นที่ดิสก์ไม่เพียงพอ",
  ARCHIVE_FAILED: "สร้างไฟล์สำรองข้อมูลไม่สำเร็จ",
  NETWORK_ERROR: "เครือข่ายขัดข้อง",
  UPLOAD_FAILED: "อัปโหลดไฟล์สำรองข้อมูลไม่สำเร็จ",
  CHECKSUM_ERROR: "ตรวจสอบไฟล์ไม่ผ่าน",
  JOB_EXPIRED: "งานหมดอายุ",
  AUTH_FAILED: "ยืนยันตัวตนเครื่องไม่สำเร็จ",
  UNKNOWN_ERROR: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
};

export function thaiError(code: string | null | undefined): string {
  if (!code) return "";
  return BACKUP_ERROR_TH[code] ?? BACKUP_ERROR_TH.UNKNOWN_ERROR;
}

export const STATUS_TH: Record<ExpressBackupStatus, string> = {
  healthy: "ปกติ",
  pending: "รอดำเนินการ",
  running: "กำลังสำรอง",
  late: "ล่าช้า",
  failed: "ล้มเหลว",
  unconfigured: "ยังไม่ได้ตั้งค่า",
};
