/**
 * Client document categories. The `files.category` column is free text, so
 * these keys are shared by the upload UI, the category picker, and the
 * grouping logic. Unknown values fall back to the "other" group.
 */

export type FileCategoryGroup = {
  key: string;
  label: string;
  shortLabel: string;
  hint: string;
};

export const FILE_CATEGORY_GROUPS: FileCategoryGroup[] = [
  {
    key: "company-certificate",
    label: "หนังสือรับรองบริษัท",
    shortLabel: "หนังสือรับรอง",
    hint: "หนังสือรับรองการจดทะเบียน (อายุไม่เกิน 6 เดือน)",
  },
  {
    key: "company-affidavit",
    label: "หนังสือบริคณห์สนธิ",
    shortLabel: "บริคณห์สนธิ",
    hint: "หนังสือบริคณห์สนธิ / ข้อบังคับบริษัท",
  },
  {
    key: "corporate",
    label: "เอกสารกรรมการ / ผู้ถือหุ้น",
    shortLabel: "กรรมการ/ผู้ถือหุ้น",
    hint: "บัตรประชาชน หนังสือเดินทาง และเอกสารผู้มีอำนาจ",
  },
  {
    key: "business-license",
    label: "ใบอนุญาต / ทะเบียนพาณิชย์",
    shortLabel: "ใบอนุญาต",
    hint: "ใบทะเบียนพาณิชย์และใบอนุญาตประกอบธุรกิจ",
  },
  {
    key: "power-of-attorney",
    label: "หนังสือมอบอำนาจ",
    shortLabel: "มอบอำนาจ",
    hint: "หนังสือมอบอำนาจพร้อมเอกสารประกอบ",
  },
  {
    key: "tax",
    label: "เอกสารภาษี",
    shortLabel: "ภาษี",
    hint: "เอกสารเกี่ยวกับภาษีและการจดทะเบียนภาษี",
  },
  {
    key: "other",
    label: "เอกสารอื่น ๆ",
    shortLabel: "อื่น ๆ",
    hint: "เอกสารทั่วไปที่ไม่อยู่ในหมวดด้านบน",
  },
];

export const FILE_CATEGORY_KEYS = new Set(FILE_CATEGORY_GROUPS.map((g) => g.key));

export const SYSTEM_REPORT_CATEGORY = "monthly-report";

export function normalizeFileCategory(
  category: string | null | undefined
): string {
  return category && FILE_CATEGORY_KEYS.has(category) ? category : "other";
}

/**
 * Split a client's files into the ordered document groups plus the
 * system-generated report PDFs (which are read-only in the client UI).
 */
export function splitClientFiles<T extends { category: string | null }>(files: T[]) {
  const systemReports = files.filter(
    (f) => f.category === SYSTEM_REPORT_CATEGORY
  );
  const documents = files.filter(
    (f) => f.category !== SYSTEM_REPORT_CATEGORY
  );
  const groups = FILE_CATEGORY_GROUPS.map((group) => ({
    ...group,
    files: documents.filter(
      (f) => normalizeFileCategory(f.category) === group.key
    ),
  }));
  return { groups, systemReports };
}

export function fileCategoryLabel(category: string | null | undefined): string {
  const key = normalizeFileCategory(category);
  return (
    FILE_CATEGORY_GROUPS.find((g) => g.key === key)?.label ?? "เอกสารอื่น ๆ"
  );
}
