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
  DOWNLOAD_FAILED: "ดาวน์โหลดไฟล์สำรองข้อมูลไม่สำเร็จ",
  CHECKSUM_MISMATCH: "ไฟล์ที่ดาวน์โหลดไม่ตรงกับต้นฉบับ หยุดทันที",
  EXTRACT_FAILED: "แตกไฟล์สำรองข้อมูลไม่สำเร็จ",
  STAGE_MISSING: "ไฟล์ที่เตรียมไว้หายไป ต้องดาวน์โหลดใหม่",
  TARGET_INVALID: "โฟลเดอร์ปลายทางไม่ถูกต้อง",
  BAK_FAILED: "สำรองข้อมูลเดิมก่อนนำเข้าไม่สำเร็จ",
  PLACE_FAILED: "นำไฟล์เข้าที่ไม่สำเร็จ",
  UNKNOWN_ERROR: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
};

export type ExpressBackupRestore = {
  id: string;
  job_id: string;
  client_id: string;
  target_agent_id: string | null;
  target_agent_name?: string | null;
  target_path: string;
  status: string;
  requested_by: string | null;
  approved_by: string | null;
  confirmed_by: string | null;
  staged_file_count: number | null;
  bak_path: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // denormalized source job info for display
  job_file_name?: string | null;
  job_checksum?: string | null;
  job_backup_size?: number | null;
};

export const RESTORE_TH: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว รอเครื่องดาวน์โหลด",
  downloading: "กำลังดาวน์โหลด",
  staged: "เตรียมไฟล์แล้ว รอยืนยัน",
  confirmed: "ยืนยันแล้ว กำลังนำเข้า",
  completed: "เสร็จแล้ว",
  failed: "ล้มเหลว",
  rejected: "ปฏิเสธแล้ว",
  cancelled: "ยกเลิกแล้ว",
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
