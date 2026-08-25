import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  type Color,
} from "pdf-lib";
import { thaiBahtText } from "@/lib/thai-baht-text";

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export const ATTACHMENT_KIND_LABELS: Record<string, string> = {
  slip: "สลิปการชำระ",
  qr: "QR คิวอาร์",
  document: "เอกสาร",
};

export type ReportBankAccount = {
  label: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  promptpay_id: string | null;
};

export type ReportAttachment = {
  kind: string;
  file_name: string;
  mime_type: string | null;
  bytes: ArrayBuffer;
};

export type ReportFiling = {
  id?: string;
  form_code: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  bank_account_id?: string | null;
  bank_account?: ReportBankAccount | null;
  attachments: Omit<ReportAttachment, "bytes">[];
};

export type ReportClient = {
  name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type Fonts = { regular: PDFFont; bold: PDFFont };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 48;
const CONTENT_W = PAGE_W - M * 2;

const COL_IDX_W = 26;
const COL_ITEM_W = 296;
const COL_DUE_W = 92;
const COL_AMT_W = 85;

const COLOR_TEXT = rgb(0.09, 0.09, 0.11);
const COLOR_MUTED = rgb(0.45, 0.45, 0.5);
const COLOR_BORDER = rgb(0.82, 0.82, 0.85);
const COLOR_HEADER_BG = rgb(0.93, 0.94, 0.96);

function fmtMoney(n: number): string {
  return Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDateTh(s: string | null | undefined): string {
  if (!s) return "-";
  const d = parseYmd(s.slice(0, 10));
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function periodToThai(periodLabel: string): string {
  const [y, m] = periodLabel.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodLabel;
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

function nowThai(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลดฟอนต์ไม่สำเร็จ: ${url}`);
  return res.arrayBuffer();
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const out: string[] = [];
  let line = "";
  const flush = () => {
    if (line) out.push(line);
    line = "";
  };
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue;
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        flush();
        line = word;
      }
    } else {
      flush();
      for (const ch of Array.from(word)) {
        const candidate = line + ch;
        if (
          line &&
          font.widthOfTextAtSize(candidate, size) > maxWidth
        ) {
          out.push(line);
          line = ch;
        } else {
          line = candidate;
        }
      }
    }
  }
  flush();
  return out.length ? out : [""];
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

class ReportRenderer {
  doc!: PDFDocument;
  fonts!: Fonts;
  page!: PDFPage;
  y!: number;
  footerDate: string;

  constructor() {
    this.footerDate = nowThai();
  }

  async init() {
    this.doc = await PDFDocument.create();
    this.doc.registerFontkit(fontkit);
    const [regularBuf, boldBuf] = await Promise.all([
      loadFont("/fonts/Sarabun-Regular.ttf"),
      loadFont("/fonts/Sarabun-Bold.ttf"),
    ]);
    this.fonts = {
      regular: await this.doc.embedFont(regularBuf),
      bold: await this.doc.embedFont(boldBuf),
    };
    this.newPage();
  }

  newPage(): PDFPage {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - M;
    return this.page;
  }

  ensureSpace(height: number) {
    if (this.y - height < M + 24) this.newPage();
  }

  text(
    value: string,
    opts: {
      x?: number;
      size?: number;
      bold?: boolean;
      color?: Color;
      align?: "left" | "center" | "right";
      width?: number;
      lineHeight?: number;
    } = {}
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const lineHeight = opts.lineHeight ?? size * 1.45;
    const color = opts.color ?? COLOR_TEXT;
    let x = opts.x ?? M;
    if (opts.align === "center" && opts.width) {
      const w = font.widthOfTextAtSize(value, size);
      x += (opts.width - w) / 2;
    } else if (opts.align === "right" && opts.width) {
      const w = font.widthOfTextAtSize(value, size);
      x += opts.width - w;
    }
    this.page.drawText(value, { x, y: this.y - size, size, font, color });
    this.y -= lineHeight;
  }

  wrapped(
    value: string,
    opts: {
      x?: number;
      width: number;
      size?: number;
      bold?: boolean;
      color?: Color;
    }
  ): string[] {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const lines = wrapText(value, font, size, opts.width);
    const lineHeight = size * 1.4;
    for (const line of lines) {
      this.text(line, {
        x: opts.x,
        size,
        bold: opts.bold,
        color: opts.color,
        lineHeight,
      });
    }
    return lines;
  }

  hr(color: Color = COLOR_BORDER) {
    this.page.drawLine({
      start: { x: M, y: this.y },
      end: { x: PAGE_W - M, y: this.y },
      thickness: 0.7,
      color,
    });
    this.y -= 10;
  }

  drawFooters() {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawLine({
        start: { x: M, y: M - 14 },
        end: { x: PAGE_W - M, y: M - 14 },
        thickness: 0.5,
        color: COLOR_BORDER,
      });
      p.drawText(`ออกเอกสาร ${this.footerDate}`, {
        x: M,
        y: M - 26,
        size: 8,
        font: this.fonts.regular,
        color: COLOR_MUTED,
      });
      const label = `หน้า ${i + 1}/${pages.length}`;
      const w = this.fonts.regular.widthOfTextAtSize(label, 8);
      p.drawText(label, {
        x: PAGE_W - M - w,
        y: M - 26,
        size: 8,
        font: this.fonts.regular,
        color: COLOR_MUTED,
      });
    });
  }
}

async function drawImageOrPdf(
  r: ReportRenderer,
  att: ReportAttachment
): Promise<void> {
  const view = new Uint8Array(att.bytes);
  const targetW = CONTENT_W;
  const maxY = PAGE_H - M * 2 - 30;

  if (isPng(view) || isJpeg(view)) {
    try {
      const img = isPng(view)
        ? await r.doc.embedPng(att.bytes)
        : await r.doc.embedJpg(att.bytes);
      let w = targetW;
      let h = (img.height / img.width) * w;
      if (h > maxY) {
        h = maxY;
        w = (img.width / img.height) * h;
      }
      r.ensureSpace(h + 18);
      r.y -= 2;
      r.text(`${ATTACHMENT_KIND_LABELS[att.kind] ?? "ไฟล์แนบ"}: ${att.file_name}`, {
        size: 8.5,
        color: COLOR_MUTED,
      });
      r.page.drawImage(img, {
        x: M + (CONTENT_W - w) / 2,
        y: r.y - h,
        width: w,
        height: h,
      });
      r.y -= h + 14;
      return;
    } catch {
      r.text(
        `[ไม่สามารถฝังรูปภาพได้: ${att.file_name}]`,
        { size: 9, color: COLOR_MUTED }
      );
      return;
    }
  }

  if (isPdfBytes(view)) {
    try {
      const src = await PDFDocument.load(att.bytes, { ignoreEncryption: true });
      const copied = await r.doc.copyPages(src, src.getPageIndices());
      for (const p of copied) r.doc.addPage(p);
      r.newPage();
      return;
    } catch {
      r.text(`[ไม่สามารถฝังไฟล์ PDF ได้: ${att.file_name}]`, {
        size: 9,
        color: COLOR_MUTED,
      });
      return;
    }
  }

  r.text(
    `[ไม่รองรับไฟล์ประเภทนี้ในรายงาน (${att.mime_type ?? "ไม่ทราบชนิด"}): ${att.file_name}]`,
    { size: 9, color: COLOR_MUTED }
  );
}

function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) ||
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && bytes[3] === 0x25)
  );
}

function drawCover(r: ReportRenderer, opts: BuildOptions) {
  const periodTh = periodToThai(opts.periodLabel);
  const firmName = opts.firmName ?? "Taxwork";

  r.text(firmName, { size: 17, bold: true, align: "center", width: CONTENT_W });
  r.y -= 2;
  r.text(
    `รายงานงานภาษีประจำเดือน ${periodTh}`,
    { size: 13, align: "center", width: CONTENT_W, color: COLOR_MUTED }
  );
  r.y -= 4;
  r.hr();
  r.y -= 6;

  r.text(opts.client.name, { size: 13, bold: true });
  if (opts.client.tax_id)
    r.text(`เลขประจำตัวผู้เสียภาษี: ${opts.client.tax_id}`, { size: 10 });
  if (opts.client.address)
    r.wrapped(opts.client.address, { width: CONTENT_W, size: 10 });
  const contactLine = [opts.client.phone, opts.client.email]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine) r.text(contactLine, { size: 10, color: COLOR_MUTED });

  r.y -= 10;
  r.text("สรุปรายการ", { size: 12, bold: true });

  const rowPadY = 5;
  const headerH = 22;
  const colXIdx = M;
  const colXItem = colXIdx + COL_IDX_W;
  const colXDues = colXItem + COL_ITEM_W;
  const colXAmt = colXDues + COL_DUE_W;
  const tableRight = colXAmt + COL_AMT_W;

  const drawTableHeader = () => {
    r.ensureSpace(headerH + 30);
    r.page.drawRectangle({
      x: M,
      y: r.y - headerH,
      width: CONTENT_W,
      height: headerH,
      color: COLOR_HEADER_BG,
    });
    const baseline = r.y - 15;
    r.page.drawText("ลำดับ", {
      x: colXIdx + 6,
      y: baseline,
      size: 9.5,
      font: r.fonts.bold,
      color: COLOR_TEXT,
    });
    r.page.drawText("รายการ", {
      x: colXItem + 6,
      y: baseline,
      size: 9.5,
      font: r.fonts.bold,
      color: COLOR_TEXT,
    });
    r.page.drawText("กำหนดชำระ", {
      x: colXDues + 6,
      y: baseline,
      size: 9.5,
      font: r.fonts.bold,
      color: COLOR_TEXT,
    });
    const amtLabel = "จำนวนเงิน";
    const amtW = r.fonts.bold.widthOfTextAtSize(amtLabel, 9.5);
    r.page.drawText(amtLabel, {
      x: tableRight - 6 - amtW,
      y: baseline,
      size: 9.5,
      font: r.fonts.bold,
      color: COLOR_TEXT,
    });
    r.y -= headerH;
  };

  drawTableHeader();

  const filings = opts.filings;
  let total = 0;

  filings.forEach((f, i) => {
    total += Number(f.amount ?? 0);
    const itemText = [f.form_code, f.description].filter(Boolean).join(" – ") || "-";
    const lines = wrapText(itemText, r.fonts.regular, 9.5, COL_ITEM_W - 12);
    const rowH = Math.max(lines.length * 9.5 * 1.4 + rowPadY * 2, 20);

    if (r.y - rowH < M + 60) {
      r.hr();
      drawTableHeader();
    }

    const top = r.y;
    r.page.drawText(String(i + 1), {
      x: colXIdx + 6,
      y: top - 14,
      size: 9.5,
      font: r.fonts.regular,
      color: COLOR_TEXT,
    });
    lines.forEach((line, li) => {
      r.page.drawText(line, {
        x: colXItem + 6,
        y: top - 14 - li * 9.5 * 1.4,
        size: 9.5,
        font: r.fonts.regular,
        color: COLOR_TEXT,
      });
    });
    r.page.drawText(formatDateTh(f.due_date), {
      x: colXDues + 6,
      y: top - 14,
      size: 9.5,
      font: r.fonts.regular,
      color: COLOR_TEXT,
    });
    const amtText = fmtMoney(Number(f.amount ?? 0));
    const amtW = r.fonts.regular.widthOfTextAtSize(amtText, 9.5);
    r.page.drawText(amtText, {
      x: tableRight - 6 - amtW,
      y: top - 14,
      size: 9.5,
      font: r.fonts.regular,
      color: COLOR_TEXT,
    });
    r.page.drawLine({
      start: { x: M, y: top - rowH },
      end: { x: tableRight, y: top - rowH },
      thickness: 0.5,
      color: COLOR_BORDER,
    });
    r.y -= rowH;
  });

  const totalRowH = 26;
  r.y -= 4;
  r.ensureSpace(totalRowH + 40);
  const totalLabel = "ยอดรวมทั้งสิ้น";
  r.page.drawText(totalLabel, {
    x: colXDues + 6,
    y: r.y - 15,
    size: 11,
    font: r.fonts.bold,
    color: COLOR_TEXT,
  });
  const totalText = fmtMoney(total);
  const totalTextW = r.fonts.bold.widthOfTextAtSize(totalText, 11);
  r.page.drawText(totalText, {
    x: tableRight - 6 - totalTextW,
    y: r.y - 15,
    size: 11,
    font: r.fonts.bold,
    color: COLOR_TEXT,
  });
  r.y -= totalRowH;

  r.text(`(${thaiBahtText(total)})`, { size: 10, color: COLOR_MUTED });
}

function drawBankBlock(r: ReportRenderer, f: ReportFiling) {
  const ba = f.bank_account!;
  const blockLines = [
    `จำนวนเงินที่ต้องชำระ: ${fmtMoney(Number(f.amount ?? 0))} บาท`,
    `โอนเข้าบัญชี${ba.bank_name}`,
    `เลขที่บัญชี: ${ba.account_no}`,
    `ชื่อบัญชี: ${ba.account_name}`,
    ...(ba.promptpay_id ? [`PromptPay: ${ba.promptpay_id}`] : []),
  ];
  const innerH = blockLines.length * 17 + 46;
  r.ensureSpace(innerH + 20);
  const top = r.y;
  r.page.drawRectangle({
    x: M,
    y: top - innerH,
    width: CONTENT_W,
    height: innerH,
    borderColor: COLOR_BORDER,
    borderWidth: 1,
  });
  r.y = top - 12;
  r.text("ข้อมูลการชำระค่าบริการ", {
    x: M + 14,
    size: 11.5,
    bold: true,
  });
  for (const line of blockLines) {
    r.text(line, { x: M + 14, size: 10.5, lineHeight: 17 });
  }
  r.y = top - innerH - 12;
}

async function drawFilingSections(r: ReportRenderer, filings: SectionFiling[]) {
  for (const f of filings) {
    const hasBank = Boolean(f.bank_account);
    const hasDocs = f.attachments.length > 0;
    if (!hasBank && !hasDocs) continue;

    r.newPage();

    const heading =
      [f.form_code, f.description].filter(Boolean).join(" – ") || "รายการ";
    r.text(heading, { size: 13, bold: true });
    r.y -= 4;

    if (hasBank) drawBankBlock(r, f);

    for (const att of f.attachments) {
      await drawImageOrPdf(r, att);
    }
  }
}

type BuildOptions = {
  firmName?: string;
  client: ReportClient;
  periodLabel: string;
  filings: ReportFiling[];
};

type SectionFiling = ReportFiling & { attachments: ReportAttachment[] };

export async function buildMonthlyReportPdf(
  opts: BuildOptions
): Promise<Uint8Array> {
  const r = new ReportRenderer();
  await r.init();

  r.doc.setTitle(
    `รายงานงานภาษีประจำเดือน ${periodToThai(opts.periodLabel)} - ${opts.client.name}`
  );
  r.doc.setAuthor(opts.firmName ?? "Taxwork");
  r.doc.setCreator(opts.firmName ?? "Taxwork");
  r.doc.setLanguage("th-TH");

  drawCover(r, opts);
  await drawFilingSections(r, opts.filings as SectionFiling[]);
  r.drawFooters();

  return r.doc.save();
}

export async function fetchAttachmentBytes(
  storagePath: string
): Promise<ArrayBuffer> {
  const res = await fetch("/api/files/sign-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath }),
  });
  if (!res.ok) throw new Error("ขอลิงก์ดาวน์โหลดไม่สำเร็จ");
  const { url } = await res.json();
  const fileRes = await fetch(url);
  if (!fileRes.ok) throw new Error("ดาวน์โหลดไฟล์แนบไม่สำเร็จ");
  return fileRes.arrayBuffer();
}
