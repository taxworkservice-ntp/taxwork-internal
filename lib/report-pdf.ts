import {
  PDFDocument,
  PDFPage,
  rgb,
  type Color,
  type PDFImage,
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
  id?: string;
  label: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  promptpay_id: string | null;
  qr_bytes?: ArrayBuffer | null;
  logo_bytes?: ArrayBuffer | null;
};

export type ReportAttachment = {
  kind: string;
  file_name: string;
  mime_type: string | null;
  bytes: ArrayBuffer;
  covered_forms?: string[];
  covered_amount?: number;
  covered_filings?: string[];
};

export type ReportDocument = {
  file_name: string;
  mime_type: string | null;
  bytes: ArrayBuffer;
};

export type ReportFiling = {
  id: string;
  form_code: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  remark?: string | null;
  payment_method?: string | null;
  bank_account_id?: string | null;
  bank_account?: ReportBankAccount | null;
  attachments: ReportAttachment[];
};

export type ReportClient = {
  name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 48;
const CONTENT_W = PAGE_W - M * 2;



const COLOR_TEXT = rgb(0.09, 0.09, 0.11);
const COLOR_MUTED = rgb(0.45, 0.45, 0.5);
const COLOR_BORDER = rgb(0.82, 0.82, 0.85);
const COLOR_HEADER_BG = rgb(0.93, 0.94, 0.96);
const COLOR_WHITE = rgb(1, 1, 1);
// Monochrome palette for the modern (print-friendly) cover.
const COLOR_INK = rgb(0.14, 0.14, 0.16);
const COLOR_PANEL = rgb(0.97, 0.97, 0.97);
const COLOR_PANEL_ALT = rgb(0.955, 0.955, 0.96);
const COLOR_ZEBRA = rgb(0.95, 0.95, 0.95);
const COLOR_TOTAL_BG = rgb(0.86, 0.86, 0.86);

export type CoverStyle = "modern" | "classic";

function resolveCoverStyle(opts: BuildOptions): CoverStyle {
  const env = process.env.NEXT_PUBLIC_REPORT_COVER_STYLE;
  if (env === "classic" || env === "modern") return env;
  return opts.coverStyle === "classic" ? "classic" : "modern";
}

function todayThaiDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`;
}

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

function cssColor(c: Color): string {
  const rgb = c as { red: number; green: number; blue: number };
  const r = Math.round(rgb.red * 255);
  const g = Math.round(rgb.green * 255);
  const b = Math.round(rgb.blue * 255);
  return `rgb(${r},${g},${b})`;
}

let canvasFontsLoaded = false;
async function ensureCanvasFonts(): Promise<void> {
  if (canvasFontsLoaded) return;
  const [regularBuf, boldBuf] = await Promise.all([
    loadFont("/fonts/Sarabun-Regular.ttf"),
    loadFont("/fonts/Sarabun-Bold.ttf"),
  ]);
  const regular = new FontFace("Sarabun", regularBuf);
  const bold = new FontFace("Sarabun", boldBuf, { weight: "bold" });
  await Promise.all([regular.load(), bold.load()]);
  document.fonts.add(regular);
  document.fonts.add(bold);
  try {
    await Promise.all([
      document.fonts.load('16px Sarabun'),
      document.fonts.load('bold 16px Sarabun'),
    ]);
    await document.fonts.ready;
  } catch {
    // ignore — canvas falls back to system Thai font
  }
  canvasFontsLoaded = true;
}

function splitGraphemes(s: string): string[] {
  try {
    const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
    return Array.from(seg.segment(s), (x) => x.segment);
  } catch {
    return Array.from(s);
  }
}

function wrapText(
  text: string,
  measure: (s: string) => number,
  maxWidth: number
): string[] {
  // Explicit newlines force a line break (e.g. label-style stacked values).
  if (text.includes("\n")) {
    return text
      .split("\n")
      .flatMap((p) => (p.trim() ? wrapText(p, measure, maxWidth) : [""]));
  }
  const out: string[] = [];
  let line = "";
  const flush = () => {
    if (line) out.push(line);
    line = "";
  };
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue;
    if (measure(word) <= maxWidth) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
      } else {
        flush();
        line = word;
      }
    } else {
      flush();
      // Grapheme-safe split: never detach สระบน/ล่าง + วรรณยุกต์ from base consonant
      for (const ch of splitGraphemes(word)) {
        const candidate = line + ch;
        if (line && measure(candidate) > maxWidth) {
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
  page!: PDFPage;
  y!: number;
  footerDate: string;
  sim = false;
  pageIndex = 0;
  slipPageByAtt = new WeakMap<ReportAttachment, number>();
  imgDimsByAtt = new WeakMap<
    ReportAttachment,
    { width: number; height: number }
  >();
  private pendingFresh = false;
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private textImageCache = new Map<string, PDFImage>();
  private bankLogoCache = new Map<ArrayBuffer, PDFImage>();

  constructor() {
    this.footerDate = nowThai();
  }

  async init() {
    this.doc = await PDFDocument.create();
    this.textImageCache.clear();
    this.bankLogoCache.clear();
    await ensureCanvasFonts();
    this.pageIndex = -1;
    this.newPage();
  }

  newPage(): PDFPage {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - M;
    this.pageIndex = this.doc.getPageCount() - 1;
    this.pendingFresh = false;
    return this.page;
  }

  requestFreshPage() {
    this.pendingFresh = true;
  }

  private realizePendingPage() {
    if (!this.pendingFresh) return;
    this.pendingFresh = false;
    this.newPage();
  }

  ensureSpace(height: number) {
    this.realizePendingPage();
    if (this.y - height < M + 24) this.newPage();
  }

  measureText(value: string, size: number, bold: boolean): number {
    this.ctx.font = `${bold ? "bold" : "normal"} ${size * 2}px Sarabun`;
    return this.ctx.measureText(value).width / 2;
  }

  /** Embed (and cache) a bank logo PNG/JPG. Returns null for unsupported bytes. */
  async embedBankLogo(bytes: ArrayBuffer): Promise<PDFImage | null> {
    const cached = this.bankLogoCache.get(bytes);
    if (cached) return cached;
    const view = new Uint8Array(bytes);
    try {
      const img = isPng(view)
        ? await this.doc.embedPng(bytes)
        : isJpeg(view)
          ? await this.doc.embedJpg(bytes)
          : null;
      if (img) this.bankLogoCache.set(bytes, img);
      return img;
    } catch {
      return null;
    }
  }

  async drawTextCanvas(
    value: string,
    x: number,
    baselineY: number,
    opts: { size?: number; bold?: boolean; color?: Color } = {},
    page: PDFPage = this.page
  ): Promise<number> {
    if (!value) return 0;
    const size = opts.size ?? 10;
    const bold = opts.bold ?? false;
    const color = opts.color ?? COLOR_TEXT;
    const scale = 2;
    const weight = bold ? "bold" : "normal";

    this.ctx.font = `${weight} ${size * scale}px Sarabun`;
    const textW = this.ctx.measureText(value).width;
    const drawW = (Math.ceil(textW) + 4) / scale;

    if (this.sim) return drawW;

    const cacheKey = `${value}|${size}|${weight}|${cssColor(color)}`;
    let img = this.textImageCache.get(cacheKey);

    if (!img) {
      const pad = 2;
      const canvasW = Math.ceil(textW) + pad * 2;
      // Taller box: ascent 1.3 + descent 0.6 so Thai สระบน/ล่าง never clips
      const canvasH = Math.ceil(size * scale * 1.9);

      this.canvas.width = canvasW;
      this.canvas.height = canvasH;

      this.ctx.font = `${weight} ${size * scale}px Sarabun`;
      this.ctx.fillStyle = cssColor(color);
      this.ctx.textBaseline = "alphabetic";
      this.ctx.fillText(value, pad, size * scale * 1.3);

      const dataUrl = this.canvas.toDataURL("image/png");
      const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) =>
        c.charCodeAt(0)
      );
      img = await this.doc.embedPng(bytes);
      this.textImageCache.set(cacheKey, img);
    }

    const drawH = Math.ceil(size * scale * 1.9) / scale;
    const imgY = baselineY - size * 0.6;
    page.drawImage(img, { x, y: imgY, width: drawW, height: drawH });

    return drawW;
  }

  async text(
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
  ): Promise<void> {
    this.realizePendingPage();
    const size = opts.size ?? 10;
    // Canvas glyph box is ~1.0x above + 0.6x below baseline — keep >=1.7x
    // leading so Thai สระบน/ล่าง never collides with adjacent lines.
    const lineHeight = opts.lineHeight ?? size * 1.7;
    const w = this.measureText(value, size, opts.bold ?? false);
    let x = opts.x ?? M;
    if (opts.align === "center" && opts.width) {
      x += (opts.width - w) / 2;
    } else if (opts.align === "right" && opts.width) {
      x += opts.width - w;
    }
    await this.drawTextCanvas(
      value,
      x,
      this.y - size,
      { size, bold: opts.bold, color: opts.color },
      this.page
    );
    this.y -= lineHeight;
  }

  async wrapped(
    value: string,
    opts: {
      x?: number;
      width: number;
      size?: number;
      bold?: boolean;
      color?: Color;
    }
  ): Promise<string[]> {
    const size = opts.size ?? 10;
    const measure = (s: string) =>
      this.measureText(s, size, opts.bold ?? false);
    const lines = wrapText(value, measure, opts.width);
    const lineHeight = size * 1.7;
    for (const line of lines) {
      await this.text(line, {
        x: opts.x,
        size,
        bold: opts.bold,
        color: opts.color,
        lineHeight,
      });
    }
    return lines;
  }

  async hr(color: Color = COLOR_BORDER) {
    this.realizePendingPage();
    if (!this.sim)
      this.page.drawLine({
        start: { x: M, y: this.y },
        end: { x: PAGE_W - M, y: this.y },
        thickness: 0.7,
        color,
      });
    this.y -= 10;
  }

  async drawFooters() {
    const pages = this.doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      p.drawLine({
        start: { x: M, y: M - 14 },
        end: { x: PAGE_W - M, y: M - 14 },
        thickness: 0.5,
        color: COLOR_BORDER,
      });
      await this.drawTextCanvas(
        `ออกเอกสาร ${this.footerDate}`,
        M,
        M - 26,
        { size: 8, color: COLOR_MUTED },
        p
      );
      const label = `หน้า ${i + 1}/${pages.length}`;
      const w = this.measureText(label, 8, false);
      await this.drawTextCanvas(
        label,
        PAGE_W - M - w,
        M - 26,
        { size: 8, color: COLOR_MUTED },
        p
      );
    }
  }
}

function refCaption(att: ReportAttachment): string {
  const bits: string[] = [];
  const forms = att.covered_forms?.filter(Boolean) ?? [];
  if (forms.length)
    bits.push(`อ้างอิง ${Array.from(new Set(forms)).join(", ")}`);
  if (typeof att.covered_amount === "number" && att.covered_amount > 0)
    bits.push(`${fmtMoney(att.covered_amount)} บาท`);
  return bits.length ? ` (${bits.join(" · ")})` : "";
}

async function drawStampBox(
  r: ReportRenderer,
  imgLeft: number,
  imgTop: number,
  imgW: number,
  att: ReportAttachment
): Promise<void> {
  const forms = Array.from(new Set(att.covered_forms?.filter(Boolean) ?? []));
  if (!forms.length || r.sim) return;
  const line1 = `อ้างอิง: ${forms.join(", ")}`;
  const line2 =
    typeof att.covered_amount === "number" && att.covered_amount > 0
      ? `ยอดชำระ ${fmtMoney(att.covered_amount)} บาท`
      : "";
  const size = 7.5;
  const textW = Math.max(
    r.measureText(line1, size, true),
    line2 ? r.measureText(line2, size, false) : 0
  );
  const w = Math.min(textW + 12, imgW * 0.7);
  const h = (line2 ? 2 : 1) * 11 + 8;
  const x = Math.max(imgLeft + imgW - w - 4, imgLeft + 4);
  const y = imgTop - h - 4;
  r.page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: rgb(1, 1, 1),
    opacity: 0.85,
    borderColor: COLOR_BORDER,
    borderWidth: 0.8,
  });
  await r.drawTextCanvas(line1, x + 6, y + h - 13, {
    size,
    bold: true,
    color: COLOR_TEXT,
  });
  if (line2)
    await r.drawTextCanvas(line2, x + 6, y + 4, {
      size,
      color: COLOR_TEXT,
    });
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
      let dims = r.imgDimsByAtt.get(att);
      if (!dims) {
        const probe = isPng(view)
          ? await r.doc.embedPng(att.bytes)
          : await r.doc.embedJpg(att.bytes);
        dims = { width: probe.width, height: probe.height };
        if (r.sim) r.imgDimsByAtt.set(att, dims);
      }
      const embed = async () =>
        isPng(view) ? await r.doc.embedPng(att.bytes) : await r.doc.embedJpg(att.bytes);
      const img = r.sim ? null : await embed();

      let w = targetW;
      let h = (dims.height / dims.width) * w;
      if (h > maxY) {
        h = maxY;
        w = (dims.width / dims.height) * h;
      }
      r.ensureSpace(h + 18);
      if (r.sim && !r.slipPageByAtt.has(att))
        r.slipPageByAtt.set(att, r.pageIndex);
      r.y -= 2;
      await r.text(
        `${ATTACHMENT_KIND_LABELS[att.kind] ?? "ไฟล์แนบ"}: ${att.file_name}${refCaption(att)}`,
        {
          size: 8.5,
          color: COLOR_MUTED,
        }
      );
      if (img)
        r.page.drawImage(img, {
          x: M + (CONTENT_W - w) / 2,
          y: r.y - h,
          width: w,
          height: h,
        });
      await drawStampBox(r, M + (CONTENT_W - w) / 2, r.y, w, att);
      r.y -= h + 14;
      return;
    } catch {
      await r.text(`[ไม่สามารถฝังรูปภาพได้: ${att.file_name}]`, {
        size: 9,
        color: COLOR_MUTED,
      });
      return;
    }
  }

  if (isPdfBytes(view)) {
    try {
      const src = await PDFDocument.load(att.bytes, { ignoreEncryption: true });
      const indices = src.getPageIndices();
      if (r.sim && !r.slipPageByAtt.has(att))
        r.slipPageByAtt.set(att, r.doc.getPageCount());
      if (r.sim) {
        for (let i = 0; i < indices.length; i++) r.doc.addPage([PAGE_W, PAGE_H]);
      } else {
        const copied = await r.doc.copyPages(src, indices);
        for (const p of copied) r.doc.addPage(p);
      }
      r.requestFreshPage();
      return;
    } catch {
      await r.text(`[ไม่สามารถฝังไฟล์ PDF ได้: ${att.file_name}]`, {
        size: 9,
        color: COLOR_MUTED,
      });
      return;
    }
  }

  await r.text(
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

async function drawCoverClassic(
  r: ReportRenderer,
  opts: BuildOptions,
  methodOf: (f: SectionFiling) => string
) {
  const periodTh = periodToThai(opts.periodLabel);
  const firmName = opts.firmName ?? "Taxwork";

  await r.text(firmName, {
    size: 17,
    bold: true,
    align: "center",
    width: CONTENT_W,
  });
  r.y -= 2;
  await r.text(`รายงานงานภาษีประจำเดือน ${periodTh}`, {
    size: 13,
    align: "center",
    width: CONTENT_W,
    color: COLOR_MUTED,
  });
  r.y -= 4;
  await r.hr();
  r.y -= 6;

  await r.text(opts.client.name, { size: 13, bold: true });
  if (opts.client.tax_id)
    await r.text(`เลขประจำตัวผู้เสียภาษี: ${opts.client.tax_id}`, { size: 10 });
  if (opts.client.address)
    await r.wrapped(opts.client.address, { width: CONTENT_W, size: 10 });
  const contactLine = [opts.client.phone, opts.client.email]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine)
    await r.text(contactLine, { size: 10, color: COLOR_MUTED });

  r.y -= 10;
  await r.text("สรุปรายการ", { size: 12, bold: true });

  const rowPadY = 7;
  const headerH = 24;
  const fontSize = 9.5;
  const lh = fontSize * 1.7;

  // 5 cols: ลำดับ | รายการ | รายละเอียด | จำนวนเงิน (ขวา) | วิธีชำระ
  const idxX = M;
  const idxW = 28;
  const itemX = idxX + idxW;
  const itemW = 90;
  const amtW = 90;
  const methW = 143;
  const detW = CONTENT_W - idxW - itemW - amtW - methW;
  const detX = itemX + itemW;
  const amtX = detX + detW;
  const methX = amtX + amtW;
  const tableRight = M + CONTENT_W;

  const drawTableHeader = async () => {
    r.ensureSpace(headerH + 30);
    if (!r.sim)
      r.page.drawRectangle({
        x: M,
        y: r.y - headerH,
        width: CONTENT_W,
        height: headerH,
        color: COLOR_HEADER_BG,
      });
    const baseline = r.y - 16;
    await r.drawTextCanvas("ลำดับ", idxX + 6, baseline, {
      size: 9.5,
      bold: true,
    });
    await r.drawTextCanvas("รายการ", itemX + 6, baseline, {
      size: 9.5,
      bold: true,
    });
    await r.drawTextCanvas("รายละเอียด", detX + 6, baseline, {
      size: 9.5,
      bold: true,
    });
    const amtLabel = "จำนวนเงิน (บาท)";
    const aW = r.measureText(amtLabel, 9.5, true);
    await r.drawTextCanvas(amtLabel, amtX + amtW - 6 - aW, baseline, {
      size: 9.5,
      bold: true,
    });
    await r.drawTextCanvas("วิธีชำระ", methX + 6, baseline, {
      size: 9.5,
      bold: true,
    });
    r.y -= headerH;
  };

  await drawTableHeader();

  const filings = opts.filings as SectionFiling[];
  let total = 0;

  for (let i = 0; i < filings.length; i++) {
    const f = filings[i];
    total += Number(f.amount ?? 0);
    const itemText = f.form_code?.trim() || "-";
    const detText = f.description?.trim() || "-";
    const linesItem = wrapText(itemText, (s) => r.measureText(s, fontSize, false), itemW - 12);
    const linesDet = wrapText(detText, (s) => r.measureText(s, fontSize, false), detW - 12);
    const methLines = wrapText(methodOf(f), (s) => r.measureText(s, fontSize, false), methW - 12);
    const maxLines = Math.max(linesItem.length, linesDet.length, methLines.length);
    const rowH = Math.max(maxLines * lh + rowPadY * 2, 24);

    if (r.y - rowH < M + 60) {
      await r.hr();
      await drawTableHeader();
    }

    const top = r.y;
    await r.drawTextCanvas(String(i + 1), idxX + 6, top - 14, {
      size: fontSize,
    });
    for (let li = 0; li < linesItem.length; li++) {
      await r.drawTextCanvas(linesItem[li], itemX + 6, top - 14 - li * lh, {
        size: fontSize,
      });
    }
    for (let li = 0; li < linesDet.length; li++) {
      await r.drawTextCanvas(linesDet[li], detX + 6, top - 14 - li * lh, {
        size: fontSize,
      });
    }
    const amtText = fmtMoney(Number(f.amount ?? 0));
    const amtTw = r.measureText(amtText, fontSize, false);
    await r.drawTextCanvas(amtText, amtX + amtW - 6 - amtTw, top - 14, {
      size: fontSize,
    });
    for (let li = 0; li < methLines.length; li++) {
      await r.drawTextCanvas(methLines[li], methX + 6, top - 14 - li * lh, {
        size: fontSize,
      });
    }
    if (!r.sim)
      r.page.drawLine({
        start: { x: M, y: top - rowH },
        end: { x: tableRight, y: top - rowH },
        thickness: 0.5,
        color: COLOR_BORDER,
      });
    r.y -= rowH;
  }

  const totalRowH = 26;
  r.y -= 4;
  r.ensureSpace(totalRowH + 40);
  const totalLabel = "ยอดรวมทั้งสิ้น";
  await r.drawTextCanvas(totalLabel, itemX + 6, r.y - 15, {
    size: 11,
    bold: true,
  });
  const totalText = fmtMoney(total);
  const totalTextW = r.measureText(totalText, 11, true);
  await r.drawTextCanvas(totalText, amtX + amtW - 6 - totalTextW, r.y - 15, {
    size: 11,
    bold: true,
  });
  r.y -= totalRowH;

  await r.text(`(${thaiBahtText(total)})`, { size: 10, color: COLOR_MUTED });
}

async function drawCoverModern(
  r: ReportRenderer,
  opts: BuildOptions,
  methodOf: (f: SectionFiling) => string
) {
  const periodTh = periodToThai(opts.periodLabel);
  const firmName = opts.firmName?.trim() || "Taxwork";
  const reportNo =
    opts.reportNo?.trim() || `TW-${opts.periodLabel.replace(/[^0-9]/g, "")}`;
  const reportDate = opts.issueDate?.trim() || todayThaiDate();
  const preparedBy = opts.preparedBy?.trim() || firmName;
  const reportLabel = opts.reportLabel?.trim() || "";

  // ---- Letterhead: centered logo on a white band ----
  const letterheadTop = PAGE_H - 30;
  let letterheadBottom = letterheadTop;
  if (opts.logo?.bytes) {
    const view = new Uint8Array(opts.logo.bytes);
    try {
      const img = isPng(view)
        ? await r.doc.embedPng(opts.logo.bytes)
        : isJpeg(view)
          ? await r.doc.embedJpg(opts.logo.bytes)
          : null;
      if (img) {
        const maxLogoH = 57.6;
        const maxLogoW = 176;
        let lw = maxLogoW;
        let lh = (img.height / img.width) * lw;
        if (lh > maxLogoH) {
          lh = maxLogoH;
          lw = (img.width / img.height) * lh;
        }
        if (!r.sim)
          r.page.drawImage(img, {
            x: (PAGE_W - lw) / 2,
            y: letterheadTop - lh,
            width: lw,
            height: lh,
          });
        letterheadBottom = letterheadTop - lh;
      }
    } catch {
      // ignore invalid logo
    }
  }

  r.y = letterheadBottom - 14;
  if (!r.sim)
    r.page.drawLine({
      start: { x: M, y: r.y },
      end: { x: PAGE_W - M, y: r.y },
      thickness: 1,
      color: COLOR_INK,
    });
  r.y -= 20;

  // ---- Title (centered) ----
  const titleText = `รายงานงานภาษีประจำเดือน ${periodTh}${
    reportLabel ? ` (${reportLabel})` : ""
  }`;
  await r.text(titleText, {
    size: 15,
    bold: true,
    align: "center",
    width: CONTENT_W,
  });
  r.y -= 5;
  const underlineW = 88;
  if (!r.sim)
    r.page.drawRectangle({
      x: M + (CONTENT_W - underlineW) / 2,
      y: r.y - 3,
      width: underlineW,
      height: 2.5,
      color: COLOR_INK,
    });
  r.y -= 18;

  // ---- Client card ----
  const contactLine = [opts.client.phone, opts.client.email]
    .filter(Boolean)
    .join("  ·  ");
  const cardPadX = 14;
  const cardPadY = 10;
  const nameH = 15;
  const metaLineH = 13.5;
  const addrLines = opts.client.address
    ? wrapText(
        opts.client.address,
        (s) => r.measureText(s, 9.5, false),
        CONTENT_W - cardPadX * 2
      )
    : [];
  const cardH =
    cardPadY * 2 +
    nameH +
    (opts.client.tax_id ? metaLineH : 0) +
    addrLines.length * metaLineH +
    (contactLine ? metaLineH : 0);
  const cardTop = r.y;
  if (!r.sim)
    r.page.drawRectangle({
      x: M,
      y: cardTop - cardH,
      width: CONTENT_W,
      height: cardH,
      color: COLOR_PANEL,
      borderColor: COLOR_BORDER,
      borderWidth: 0.8,
    });
  let cy = cardTop - cardPadY - 10.5;
  await r.drawTextCanvas(opts.client.name, M + cardPadX, cy, {
    size: 12,
    bold: true,
  });
  cy -= nameH;
  if (opts.client.tax_id) {
    await r.drawTextCanvas(
      `เลขประจำตัวผู้เสียภาษี: ${opts.client.tax_id}`,
      M + cardPadX,
      cy,
      { size: 9.5, color: COLOR_MUTED }
    );
    cy -= metaLineH;
  }
  for (const line of addrLines) {
    await r.drawTextCanvas(line, M + cardPadX, cy, { size: 9.5 });
    cy -= metaLineH;
  }
  if (contactLine) {
    await r.drawTextCanvas(contactLine, M + cardPadX, cy, {
      size: 9.5,
      color: COLOR_MUTED,
    });
  }
  r.y = cardTop - cardH - 10;

  // ---- Meta grid (single row, 4 columns) ----
  const metaItems: [string, string][] = [
    ["เลขที่รายงาน", reportNo],
    [reportLabel ? "ครั้งที่" : "รอบงวด", reportLabel || periodTh],
    ["วันที่ออกเอกสาร", reportDate],
    ["ผู้จัดทำ", preparedBy],
  ];
  const colW = CONTENT_W / 4;
  const rowH = 30;
  const gridH = rowH + 6;
  const gridTop = r.y;
  const fitMeta = (s: string, maxW: number): string => {
    if (r.measureText(s, 9.5, true) <= maxW) return s;
    let out = "";
    for (const ch of Array.from(s)) {
      if (r.measureText(out + ch + "…", 9.5, true) > maxW) break;
      out += ch;
    }
    return out + "…";
  };
  if (!r.sim)
    r.page.drawRectangle({
      x: M,
      y: gridTop - gridH,
      width: CONTENT_W,
      height: gridH,
      color: COLOR_PANEL_ALT,
      borderColor: COLOR_BORDER,
      borderWidth: 0.6,
    });
  for (let i = 0; i < metaItems.length; i++) {
    const x = M + i * colW + 10;
    const value = fitMeta(metaItems[i][1], colW - 20);
    await r.drawTextCanvas(metaItems[i][0], x, gridTop - 11, {
      size: 8,
      color: COLOR_MUTED,
    });
    await r.drawTextCanvas(value, x, gridTop - 23, {
      size: 9.5,
      bold: true,
    });
    if (!r.sim && i > 0)
      r.page.drawLine({
        start: { x: M + i * colW, y: gridTop - 6 },
        end: { x: M + i * colW, y: gridTop - gridH + 6 },
        thickness: 0.5,
        color: COLOR_BORDER,
      });
  }
  r.y = gridTop - gridH - 12;

  // ---- Summary heading ----
  await r.text("สรุปรายการ", { size: 11, bold: true });
  r.y -= 3;

  const rowPadY = 6;
  const headerH = 22;
  const fontSize = 9.5;
  const lh = fontSize * 1.6;

  // 5 cols: ลำดับ | รายการ | รายละเอียด | จำนวนเงิน (ขวา) | วิธีชำระ
  const idxX = M;
  const idxW = 28;
  const itemX = idxX + idxW;
  const itemW = 80;
  const amtW = 90;
  const methW = 160;
  const detW = CONTENT_W - idxW - itemW - amtW - methW;
  const detX = itemX + itemW;
  const amtX = detX + detW;
  const methX = amtX + amtW;
  const tableRight = M + CONTENT_W;

  const drawTableHeader = async () => {
    r.ensureSpace(headerH + 24);
    if (!r.sim)
      r.page.drawRectangle({
        x: M,
        y: r.y - headerH,
        width: CONTENT_W,
        height: headerH,
        color: COLOR_INK,
      });
    const baseline = r.y - 14;
    await r.drawTextCanvas("ลำดับ", idxX + 6, baseline, {
      size: 9.5,
      bold: true,
      color: COLOR_WHITE,
    });
    await r.drawTextCanvas("รายการ", itemX + 6, baseline, {
      size: 9.5,
      bold: true,
      color: COLOR_WHITE,
    });
    await r.drawTextCanvas("รายละเอียด", detX + 6, baseline, {
      size: 9.5,
      bold: true,
      color: COLOR_WHITE,
    });
    const amtLabel = "จำนวนเงิน";
    const aW = r.measureText(amtLabel, 9.5, true);
    await r.drawTextCanvas(amtLabel, amtX + amtW - 6 - aW, baseline, {
      size: 9.5,
      bold: true,
      color: COLOR_WHITE,
    });
    await r.drawTextCanvas("วิธีชำระ", methX + 6, baseline, {
      size: 9.5,
      bold: true,
      color: COLOR_WHITE,
    });
    r.y -= headerH;
  };

  await drawTableHeader();

  const filings = opts.filings as SectionFiling[];
  let total = 0;

  for (let i = 0; i < filings.length; i++) {
    const f = filings[i];
    total += Number(f.amount ?? 0);
    const itemText = f.form_code?.trim() || "-";
    const detText = f.description?.trim() || "-";

    // Optional bank logo shown after the payment-method text.
    let logoImg: PDFImage | null = null;
    let logoW = 0;
    let logoH = 0;
    const logoBytes = f.bank_account?.logo_bytes;
    if (logoBytes) {
      const img = await r.embedBankLogo(logoBytes);
      if (img && img.width > 0 && img.height > 0) {
        logoImg = img;
        logoH = 11;
        logoW = Math.min((img.width / img.height) * logoH, 32);
        logoH = logoW / (img.width / img.height);
      }
    }
    const methWrapW = methW - 12 - (logoImg ? logoW + 4 : 0);

    const linesItem = wrapText(itemText, (s) => r.measureText(s, fontSize, false), itemW - 12);
    const linesDet = wrapText(detText, (s) => r.measureText(s, fontSize, false), detW - 12);
    const methLines = wrapText(methodOf(f), (s) => r.measureText(s, fontSize, false), methWrapW);
    const maxLines = Math.max(linesItem.length, linesDet.length, methLines.length);
    const rowH = Math.max(maxLines * lh + rowPadY * 2, 22);

    if (r.y - rowH < M + 50) {
      await r.hr();
      await drawTableHeader();
    }

    const top = r.y;
    if (!r.sim && i % 2 === 1)
      r.page.drawRectangle({
        x: M,
        y: top - rowH,
        width: CONTENT_W,
        height: rowH,
        color: COLOR_ZEBRA,
      });
    await r.drawTextCanvas(String(i + 1), idxX + 6, top - 13, {
      size: fontSize,
    });
    for (let li = 0; li < linesItem.length; li++) {
      await r.drawTextCanvas(linesItem[li], itemX + 6, top - 13 - li * lh, {
        size: fontSize,
      });
    }
    for (let li = 0; li < linesDet.length; li++) {
      await r.drawTextCanvas(linesDet[li], detX + 6, top - 13 - li * lh, {
        size: fontSize,
      });
    }
    const amtText = fmtMoney(Number(f.amount ?? 0));
    const amtTw = r.measureText(amtText, fontSize, false);
    await r.drawTextCanvas(amtText, amtX + amtW - 6 - amtTw, top - 13, {
      size: fontSize,
    });
    for (let li = 0; li < methLines.length; li++) {
      await r.drawTextCanvas(methLines[li], methX + 6, top - 13 - li * lh, {
        size: fontSize,
      });
    }
    if (logoImg) {
      const lastBaseline = top - 13 - (methLines.length - 1) * lh;
      if (!r.sim)
        r.page.drawImage(logoImg, {
          x: methX + methW - 6 - logoW,
          y: lastBaseline - logoH / 2 + 3,
          width: logoW,
          height: logoH,
        });
    }
    if (!r.sim)
      r.page.drawLine({
        start: { x: M, y: top - rowH },
        end: { x: tableRight, y: top - rowH },
        thickness: 0.5,
        color: COLOR_BORDER,
      });
    r.y -= rowH;
  }

  const totalRowH = 26;
  r.y -= 3;
  r.ensureSpace(totalRowH + 34);
  const totalTop = r.y;
  if (!r.sim)
    r.page.drawRectangle({
      x: M,
      y: totalTop - totalRowH,
      width: CONTENT_W,
      height: totalRowH,
      color: COLOR_TOTAL_BG,
    });
  const totalLabel = "ยอดรวมทั้งสิ้น";
  await r.drawTextCanvas(totalLabel, itemX + 6, totalTop - 16, {
    size: 11,
    bold: true,
  });
  const totalText = fmtMoney(total);
  const totalTextW = r.measureText(totalText, 11, true);
  await r.drawTextCanvas(totalText, amtX + amtW - 6 - totalTextW, totalTop - 16, {
    size: 11,
    bold: true,
  });
  r.y = totalTop - totalRowH - 10;

  await r.text(`(${thaiBahtText(total)})`, { size: 10, color: COLOR_MUTED });

  r.y -= 6;
  r.ensureSpace(20);
  await r.text("เอกสารลับเฉพาะสำหรับลูกค้า — ห้ามเผยแพร่", {
    size: 8,
    color: COLOR_MUTED,
    align: "center",
    width: CONTENT_W,
  });
}

function collectEvidenceItems(filings: SectionFiling[]): ReportAttachment[] {
  const items: ReportAttachment[] = [];
  for (const f of filings) {
    for (const att of f.attachments) {
      if (att.kind === "qr") continue;
      items.push(att);
    }
  }
  return items;
}

async function drawEvidencePages(
  r: ReportRenderer,
  filings: SectionFiling[]
): Promise<void> {
  const items = collectEvidenceItems(filings);
  if (!items.length) return;
  r.requestFreshPage();
  for (const att of items) await drawImageOrPdf(r, att);
}

async function drawDocument(r: ReportRenderer, doc: ReportDocument): Promise<void> {
  const view = new Uint8Array(doc.bytes);
  const targetW = CONTENT_W;
  const maxY = PAGE_H - M * 2 - 30;

  if (isPng(view) || isJpeg(view)) {
    try {
      const probe = isPng(view)
        ? await r.doc.embedPng(doc.bytes)
        : await r.doc.embedJpg(doc.bytes);
      const dims = { width: probe.width, height: probe.height };
      const img = r.sim ? null : await (isPng(view) ? r.doc.embedPng(doc.bytes) : r.doc.embedJpg(doc.bytes));

      let w = targetW;
      let h = (dims.height / dims.width) * w;
      if (h > maxY) {
        h = maxY;
        w = (dims.width / dims.height) * h;
      }
      r.ensureSpace(h + 18);
      r.y -= 2;
      await r.text(doc.file_name, { size: 8.5, color: COLOR_MUTED });
      if (img)
        r.page.drawImage(img, {
          x: M + (CONTENT_W - w) / 2,
          y: r.y - h,
          width: w,
          height: h,
        });
      r.y -= h + 14;
      return;
    } catch {
      await r.text(`[ไม่สามารถฝังรูปภาพได้: ${doc.file_name}]`, {
        size: 9,
        color: COLOR_MUTED,
      });
      return;
    }
  }

  if (isPdfBytes(view)) {
    try {
      const src = await PDFDocument.load(doc.bytes, { ignoreEncryption: true });
      const indices = src.getPageIndices();
      if (r.sim) {
        for (let i = 0; i < indices.length; i++) r.doc.addPage([PAGE_W, PAGE_H]);
      } else {
        const copied = await r.doc.copyPages(src, indices);
        for (const p of copied) r.doc.addPage(p);
      }
      r.requestFreshPage();
      return;
    } catch {
      await r.text(`[ไม่สามารถฝังไฟล์ PDF ได้: ${doc.file_name}]`, {
        size: 9,
        color: COLOR_MUTED,
      });
      return;
    }
  }

  await r.text(
    `[ไม่รองรับไฟล์ประเภทนี้ในรายงาน (${doc.mime_type ?? "ไม่ทราบชนิด"}): ${doc.file_name}]`,
    { size: 9, color: COLOR_MUTED }
  );
}

async function drawDocumentPages(
  r: ReportRenderer,
  docs: ReportDocument[]
): Promise<void> {
  if (!docs.length) return;
  r.requestFreshPage();
  for (const d of docs) await drawDocument(r, d);
}

async function drawWatermark(r: ReportRenderer, opts: BuildOptions): Promise<void> {
  if (!opts.logo?.bytes) return;
  const view = new Uint8Array(opts.logo.bytes);
  try {
    const img = isPng(view)
      ? await r.doc.embedPng(opts.logo.bytes)
      : isJpeg(view)
        ? await r.doc.embedJpg(opts.logo.bytes)
        : null;
    if (!img) return;
    const firstPage = r.doc.getPages()[0];
    if (!firstPage) return;
    const maxH = 72;
    const maxW = CONTENT_W * 0.36;
    let w = maxW;
    let h = (img.height / img.width) * w;
    if (h > maxH) {
      h = maxH;
      w = (img.width / img.height) * h;
    }
    firstPage.drawImage(img, {
      x: PAGE_W - M - w,
      y: M - 8,
      width: w,
      height: h,
      opacity: 0.85,
    });
  } catch {
    // ignore invalid logo
  }
}

type BuildOptions = {
  firmName?: string;
  client: ReportClient;
  periodLabel: string;
  filings: ReportFiling[];
  logo?: { bytes: ArrayBuffer } | null;
  /** Flat ordered documents appended after the cover, in upload order. */
  documents?: ReportDocument[];
  /** Cover design. "classic" keeps the original grayscale cover for rollback. */
  coverStyle?: CoverStyle;
  /** Report number shown in the cover meta grid. Derived from period if omitted. */
  reportNo?: string;
  /** Round label, e.g. "ครั้งที่ 2", shown in the title and meta grid. */
  reportLabel?: string;
  /** Issue date shown in the cover meta grid. Defaults to today (พ.ศ.). */
  issueDate?: string;
  /** Preparer shown in the cover meta grid. Defaults to the firm name. */
  preparedBy?: string;
  /** When true, render only the cover page (for fast previews). */
  preview?: boolean;
};

type SectionFiling = ReportFiling & { attachments: ReportAttachment[] };

function makeMethodOf(
  orderedItems: ReportAttachment[],
  pageByIndex: number[] | null
) {
  const indexOf = new Map(orderedItems.map((a, i) => [a, i] as const));
  return (f: SectionFiling): string => {
    const custom = f.payment_method?.trim();
    const ba = f.bank_account;
    const acct = ba?.account_no?.trim();
    const bank = ba?.bank_name?.trim() || ba?.label?.trim() || "";
    const transferLike = custom
      ? /โอน|transfer|ธนาคาร|บัญชี/i.test(custom)
      : Boolean(ba);

    // Bank transfer: bank name and account number on their own lines.
    if (ba && transferLike && acct) {
      return [bank, `เลขที่ ${acct}`].filter(Boolean).join("\n");
    }
    if (custom) return custom;
    const slips = f.attachments.filter(
      (a) => a.kind === "slip" && (a.covered_filings ?? []).includes(f.id)
    );
    if (slips.length) {
      if (
        pageByIndex &&
        slips.every((s) => indexOf.has(s)) &&
        slips.every((s) => (pageByIndex[indexOf.get(s)!] ?? -1) >= 0)
      ) {
        const pages = Array.from(
          new Set(slips.map((s) => pageByIndex[indexOf.get(s)!] + 1))
        );
        return `สลิป หน้า ${pages.join(", ")}`;
      }
      return "สลิป";
    }
    if (
      f.attachments.some((a) => a.kind === "qr") ||
      f.bank_account?.qr_bytes
    )
      return "QR Code";
    if (ba)
      return (
        [bank, acct ? `เลขที่ ${acct}` : ""].filter(Boolean).join("\n") ||
        ba.label
      );
    return "-";
  };
}

function applyDocMeta(r: ReportRenderer, opts: BuildOptions): void {
  r.doc.setTitle(
    `รายงานงานภาษีประจำเดือน ${periodToThai(opts.periodLabel)} - ${opts.client.name}`
  );
  r.doc.setAuthor(opts.firmName ?? "Taxwork");
  r.doc.setCreator(opts.firmName ?? "Taxwork");
  r.doc.setLanguage("th-TH");
}

export async function buildMonthlyReportPdf(
  opts: BuildOptions
): Promise<Uint8Array> {
  const r = new ReportRenderer();
  const filings = opts.filings as SectionFiling[];
  const orderedEvidence = collectEvidenceItems(filings);
  const style = resolveCoverStyle(opts);
  const drawCoverFn = style === "classic" ? drawCoverClassic : drawCoverModern;
  const preview = opts.preview === true;

  let prevSig = "";
  let pageByIndex: number[] = [];

  // Simulated passes: resolve which report page each slip lands on.
  // Skipped for cover-only previews, which never reference slip pages.
  if (!preview) {
    for (let iter = 0; iter < 4; iter++) {
      r.sim = true;
      r.slipPageByAtt = new WeakMap();
      await r.init();
      applyDocMeta(r, opts);
      const method = makeMethodOf(orderedEvidence, iter === 0 ? null : pageByIndex);
      await drawCoverFn(r, opts, method);
      await drawEvidencePages(r, filings);
      await drawDocumentPages(r, opts.documents ?? []);
      pageByIndex = orderedEvidence.map(
        (a) => r.slipPageByAtt.get(a) ?? -1
      );
      const sig = `${r.doc.getPageCount()}|${pageByIndex.join(",")}`;
      if (sig === prevSig) break;
      prevSig = sig;
    }
  }

  // Real pass.
  r.sim = false;
  await r.init();
  applyDocMeta(r, opts);
  const method = makeMethodOf(orderedEvidence, preview ? null : pageByIndex);
  await drawCoverFn(r, opts, method);
  if (style === "classic") await drawWatermark(r, opts);
  if (!preview) {
    await drawEvidencePages(r, filings);
    await drawDocumentPages(r, opts.documents ?? []);
  }
  await r.drawFooters();

  return r.doc.save();
}

export async function fetchAttachmentBytes(
  storagePath: string
): Promise<ArrayBuffer> {
  // Same-origin path (e.g. a bundled asset under /public) — used for local
  // mock logos/QRs that aren't stored in R2.
  if (storagePath.startsWith("/")) {
    const local = await fetch(storagePath);
    if (!local.ok) {
      throw new Error(`โหลดไฟล์ไม่สำเร็จ (HTTP ${local.status}): ${storagePath}`);
    }
    return local.arrayBuffer();
  }
  const res = await fetch("/api/files/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath }),
  });
  if (!res.ok) {
    throw new Error(`โหลดไฟล์แนบไม่สำเร็จ (HTTP ${res.status}): ${storagePath}`);
  }
  return res.arrayBuffer();
}
