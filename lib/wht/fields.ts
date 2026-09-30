import { thaiBahtText } from "@/lib/thai-baht-text";

export type WhtFormType =
  | "pnd1"
  | "pnd1_special"
  | "pnd2"
  | "pnd3"
  | "pnd2a"
  | "pnd3a"
  | "pnd53";

export const WHT_FORM_TYPES: WhtFormType[] = [
  "pnd3",
  "pnd53",
  "pnd1",
  "pnd2",
  "pnd3a",
  "pnd2a",
  "pnd1_special",
];

export const WHT_FORM_TYPE_LABELS: Record<WhtFormType, string> = {
  pnd1: "ภ.ง.ด.1",
  pnd1_special: "ภ.ง.ด.1ก",
  pnd2: "ภ.ง.ด.2",
  pnd3: "ภ.ง.ด.3",
  pnd2a: "ภ.ง.ด.2ก",
  pnd3a: "ภ.ง.ด.3ก",
  pnd53: "ภ.ง.ด.53",
};

export const WHT_DESCRIPTION_PRESETS = [
  "ค่าจ้างทำของ",
  "ค่าขนส่ง",
  "ค่านายหน้า",
  "ค่าเบี้ยประกันวินาศภัย",
  "ค่าโฆษณา",
  "ค่าเช่า",
  "ค่าบริการ",
] as const;

export const WHT_DESCRIPTION_RATE_MAP: Record<string, string> = {
  ค่าจ้างทำของ: "3",
  ค่าขนส่ง: "1",
  ค่านายหน้า: "3",
  ค่าเบี้ยประกันวินาศภัย: "1",
  ค่าโฆษณา: "2",
  ค่าเช่า: "5",
  ค่าบริการ: "3",
};

/** User-saved custom description + rate presets (localStorage, same pattern
 * as client favorites — per browser, no migration). */
export type WhtCustomPreset = { description: string; rate: string };

export const WHT_CUSTOM_PRESETS_KEY = "wht.customDescriptions";
const WHT_CUSTOM_PRESETS_MAX = 50;

export function loadCustomPresets(): WhtCustomPreset[] {
  try {
    const raw = localStorage.getItem(WHT_CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (p): p is WhtCustomPreset =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as WhtCustomPreset).description === "string" &&
          typeof (p as WhtCustomPreset).rate === "string" &&
          (p as WhtCustomPreset).description.trim() !== ""
      )
      .map((p) => ({ description: p.description.trim().slice(0, 200), rate: p.rate.trim().slice(0, 10) }))
      .slice(0, WHT_CUSTOM_PRESETS_MAX);
  } catch {
    return [];
  }
}

function persistCustomPresets(list: WhtCustomPreset[]): void {
  try {
    localStorage.setItem(WHT_CUSTOM_PRESETS_KEY, JSON.stringify(list));
  } catch {
    /* storage full/blocked — presets just don't persist */
  }
}

/** Insert or update by description (case-sensitive Thai match). */
export function saveCustomPreset(description: string, rate: string): WhtCustomPreset[] {
  const desc = description.trim().slice(0, 200);
  if (!desc) return loadCustomPresets();
  const next = loadCustomPresets().filter((p) => p.description !== desc);
  next.unshift({ description: desc, rate: rate.trim().slice(0, 10) });
  const trimmed = next.slice(0, WHT_CUSTOM_PRESETS_MAX);
  persistCustomPresets(trimmed);
  return trimmed;
}

export function deleteCustomPreset(description: string): WhtCustomPreset[] {
  const next = loadCustomPresets().filter((p) => p.description !== description);
  persistCustomPresets(next);
  return next;
}

/** Absolute checkmark position per form on the 1512x2138 template. */
export const WHT_CHECKMARK_POS: Record<
  WhtFormType,
  { top: number; left: number; fs: number }
> = {
  pnd1: { top: 605, left: 535, fs: 32 },
  pnd1_special: { top: 605, left: 733, fs: 32 },
  pnd2: { top: 605, left: 1007, fs: 32 },
  pnd3: { top: 605, left: 1203, fs: 32 },
  pnd2a: { top: 657, left: 535, fs: 32 },
  pnd3a: { top: 657, left: 733, fs: 32 },
  pnd53: { top: 655, left: 1005, fs: 32 },
};

export const WHT_PAGE_W = 1512;
export const WHT_PAGE_H = 2138;

/** Signature / stamp overlay geometry (matches invoice-system print.tsx). */
export const WHT_SIGNATURE_BOX = {
  top: 1862,
  left: 964,
  width: 186,
  height: 70,
} as const;

export const WHT_STAMP_BOX = {
  top: 1870,
  left: 1265,
  width: 139,
  height: 139,
} as const;

/** Vertical nudge range (template px) for the on-form signature position. */
export const WHT_SIG_OFFSET_LIMIT = 80;
export const WHT_SIG_OFFSET_KEY = "wht.sigOffsetY";

export function clampSigOffset(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(-WHT_SIG_OFFSET_LIMIT, Math.min(WHT_SIG_OFFSET_LIMIT, Math.round(n)));
}

export function loadSigOffset(): number {
  try {
    return clampSigOffset(localStorage.getItem(WHT_SIG_OFFSET_KEY));
  } catch {
    return 0;
  }
}

export function saveSigOffset(v: number): void {
  try {
    localStorage.setItem(WHT_SIG_OFFSET_KEY, String(clampSigOffset(v)));
  } catch {
    /* ignore */
  }
}

export type WhtFormValues = {
  formType: WhtFormType;
  certificateNo: string;
  payerName: string;
  payerTaxId: string;
  payerAddress: string;
  payeeName: string;
  payeeTaxId: string;
  payeeAddress: string;
  description: string;
  issueDate: string;
  signDate: string;
  amount: string;
  whtRate: string;
};

export const WHT_EMPTY_VALUES: WhtFormValues = {
  formType: "pnd3",
  certificateNo: "",
  payerName: "",
  payerTaxId: "",
  payerAddress: "",
  payeeName: "",
  payeeTaxId: "",
  payeeAddress: "",
  description: "ค่าจ้างทำของ",
  issueDate: "",
  signDate: "",
  amount: "",
  whtRate: "3",
};

export function parseAmount(raw: string): number {
  const n = parseFloat(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function calcWht(amountRaw: string, rateRaw: string): number {
  const amount = parseAmount(amountRaw);
  const rate = parseAmount(rateRaw);
  if (!(amount > 0) || !(rate > 0)) return 0;
  return Math.round(amount * (rate / 100) * 100) / 100;
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null || n === 0) return "";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

/**
 * Digit-box columns measured on the PND background (template px).
 * Boxes: [951-982] [997-1119] [1136-1289] [1303-1366] [1383-1414].
 * A single spaced string drifts right (gap error accumulates), so each
 * 13-digit ID renders as 5 group fields pinned to its box.
 */
const TAXID_GROUP_LEFTS = [961, 1005, 1144, 1311, 1391] as const;

export function splitTaxIdGroups(
  s: string | null | undefined
): [string, string, string, string, string] {
  const digits = String(s || "")
    .replace(/\D/g, "")
    .slice(0, 13)
    .padEnd(13, " ");
  return [
    digits[0],
    digits.slice(1, 5).split("").join(" "),
    digits.slice(5, 10).split("").join(" "),
    digits.slice(10, 12).split("").join(" "),
    digits[12],
  ];
}

export function taxIdDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function checkTaxId(raw: string): {
  ok: boolean;
  reason: string;
} {
  const digits = taxIdDigits(raw);
  if (digits.length !== 13) return { ok: false, reason: "ต้องมี 13 หลัก" };
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i], 10) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  if (check !== parseInt(digits[12], 10))
    return { ok: false, reason: "checksum ไม่ผ่าน" };
  return { ok: true, reason: "" };
}

/** Live mask: plain digits until 13, then grouped 1-2345-67890-12-3. */
export function maskTaxIdInput(raw: string): string {
  const digits = taxIdDigits(raw).slice(0, 13);
  if (!raw && digits.length === 0) return "";
  if (digits.length !== 13) return digits;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

export function whtAmountThaiText(whtAmount: number): string {
  if (!(whtAmount > 0)) return "";
  return thaiBahtText(whtAmount);
}

export type WhtOverlayField = {
  name: string;
  top: number;
  left: number;
  fontSize: number;
  bold?: boolean;
  rightAlign?: boolean;
  width?: number;
  wrap?: boolean;
  value: string;
};

const FIELD_TOP_OFFSET = 3;

function cssTop(configTop: number, fs: number): number {
  return configTop - fs + FIELD_TOP_OFFSET;
}

/**
 * Absolute field layout on the 1512x2138 PND background.
 * Mirrors invoice-system print.tsx buildFields (same tops/lefts/sizes).
 */
export function buildWhtOverlay(v: WhtFormValues): WhtOverlayField[] {
  const amount = parseAmount(v.amount);
  const wht = calcWht(v.amount, v.whtRate);
  const dateStr = fmtDate(v.issueDate);
  const signDateStr = fmtDate(v.signDate || v.issueDate);
  const amtStr = fmtNum(amount);
  const whtStr = fmtNum(wht);
  const thaiStr = whtAmountThaiText(wht);
  const AMT_W = 260;
  const WHT_W = 180;

  const payerGroups = splitTaxIdGroups(v.payerTaxId);
  const payeeGroups = splitTaxIdGroups(v.payeeTaxId);

  const fields: WhtOverlayField[] = [
    { name: "wht_id", top: cssTop(187, 33), left: 1317, fontSize: 33, value: v.certificateNo.trim() },
    { name: "payer_name", top: cssTop(279, 32), left: 165, fontSize: 32, width: 583, value: v.payerName.trim() },
    { name: "payer_address", top: cssTop(337, 31), left: 166, fontSize: 31, wrap: true, width: 1166, value: v.payerAddress.trim() },
    { name: "name", top: cssTop(464, 32), left: 169, fontSize: 32, width: 583, value: v.payeeName.trim() },
    { name: "address", top: cssTop(531, 31), left: 171, fontSize: 31, wrap: true, width: 1166, value: v.payeeAddress.trim() },
    { name: "description1", top: cssTop(1624, 33), left: 290, fontSize: 33, width: 480, value: v.description.trim() },
    { name: "date1", top: cssTop(1620, 35), left: 857, fontSize: 35, value: dateStr },
    { name: "amount1", top: cssTop(1620, 35), left: 1175 - AMT_W, fontSize: 35, rightAlign: true, width: AMT_W, value: amtStr },
    { name: "wht1", top: cssTop(1620, 35), left: 1370 - WHT_W, fontSize: 35, rightAlign: true, width: WHT_W, value: whtStr },
    { name: "amount2", top: cssTop(1680, 35), left: 1175 - AMT_W, fontSize: 35, rightAlign: true, width: AMT_W, value: amtStr },
    { name: "wht2", top: cssTop(1680, 35), left: 1370 - WHT_W, fontSize: 35, rightAlign: true, width: WHT_W, value: whtStr },
    { name: "thai_amount", top: cssTop(1726, 36), left: 503, fontSize: 36, value: thaiStr },
    { name: "date_bottom", top: cssTop(1945, 35), left: 972, fontSize: 35, value: signDateStr },
  ];

  payerGroups.forEach((g, i) => {
    fields.push({
      name: `payer_taxid_g${i}`,
      top: cssTop(241, 45),
      left: TAXID_GROUP_LEFTS[i],
      fontSize: 45,
      bold: true,
      value: g.trim(),
    });
  });
  payeeGroups.forEach((g, i) => {
    fields.push({
      name: `taxid_g${i}`,
      top: cssTop(416, 45),
      left: TAXID_GROUP_LEFTS[i],
      fontSize: 45,
      bold: true,
      value: g.trim(),
    });
  });

  return fields;
}

export type WhtValidationError = {
  field: keyof WhtFormValues | "signature" | "stamp";
  message: string;
};

export function validateWhtForm(v: WhtFormValues): WhtValidationError[] {
  const errors: WhtValidationError[] = [];
  if (!v.payerName.trim())
    errors.push({ field: "payerName", message: "กรุณากรอกชื่อผู้จ่าย" });
  if (!taxIdDigits(v.payerTaxId)) {
    errors.push({ field: "payerTaxId", message: "กรุณากรอกเลขผู้เสียภาษีผู้จ่าย" });
  } else if (!checkTaxId(v.payerTaxId).ok) {
    errors.push({
      field: "payerTaxId",
      message: `เลขผู้จ่าย: ${checkTaxId(v.payerTaxId).reason}`,
    });
  }
  if (!v.payerAddress.trim())
    errors.push({ field: "payerAddress", message: "กรุณากรอกที่อยู่ผู้จ่าย" });
  if (!v.payeeName.trim())
    errors.push({ field: "payeeName", message: "กรุณากรอกชื่อผู้รับ" });
  if (!taxIdDigits(v.payeeTaxId)) {
    errors.push({ field: "payeeTaxId", message: "กรุณากรอกเลขผู้เสียภาษีผู้รับ" });
  } else if (!checkTaxId(v.payeeTaxId).ok) {
    errors.push({
      field: "payeeTaxId",
      message: `เลขผู้รับ: ${checkTaxId(v.payeeTaxId).reason}`,
    });
  }
  if (!v.payeeAddress.trim())
    errors.push({ field: "payeeAddress", message: "กรุณากรอกที่อยู่ผู้รับ" });
  if (!v.description.trim())
    errors.push({ field: "description", message: "กรุณากรอกรายการ" });
  if (!v.issueDate)
    errors.push({ field: "issueDate", message: "กรุณาเลือกวันที่จ่าย" });
  if (!(parseAmount(v.amount) > 0))
    errors.push({ field: "amount", message: "จำนวนเงินต้องมากกว่า 0" });
  const rate = parseAmount(v.whtRate);
  if (!(rate >= 0 && rate <= 100))
    errors.push({ field: "whtRate", message: "อัตราต้องอยู่ระหว่าง 0–100" });
  return errors;
}
