import fs from "node:fs";
import path from "node:path";
import type { ReportModel, ReportModelFiling } from "@/lib/report-model";

/**
 * Server-side HTML template for the professional report PDF (rendered to PDF
 * by headless Chromium). Mirrors the formal wording and the modern layout:
 * a cover with one statement card per filing, a dedicated payment page, and
 * attached documents appended by the caller.
 */

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

let fontCssCache: string | null = null;

function readFontBase64(file: string): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "fonts", file));
    return buf.toString("base64");
  } catch {
    return null;
  }
}

function fontCss(): string {
  if (fontCssCache !== null) return fontCssCache;
  const regular = readFontBase64("Sarabun-Regular.ttf");
  const bold = readFontBase64("Sarabun-Bold.ttf");
  const faces: string[] = [];
  if (regular)
    faces.push(
      `@font-face{font-family:'Sarabun';font-style:normal;font-weight:400;src:url(data:font/ttf;base64,${regular}) format('truetype');}`
    );
  if (bold)
    faces.push(
      `@font-face{font-family:'Sarabun';font-style:normal;font-weight:700;src:url(data:font/ttf;base64,${bold}) format('truetype');}`
    );
  fontCssCache = faces.join("\n");
  return fontCssCache;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n: number): string {
  return Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function periodToThai(periodLabel: string): string {
  const [y, m] = periodLabel.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodLabel;
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

function dateToThai(ymd: string | null): string {
  if (!ymd) return "-";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

/** Short payment reference derived from the report number (stable, printable). */
function paymentRef(model: ReportModel): string {
  return model.reportNo?.trim() || `TW-${model.periodLabel.replace(/[^0-9]/g, "")}`;
}

function payLine(f: ReportModelFiling): string | null {
  const custom = f.payment_method?.trim();
  if (custom) return custom;
  return null;
}

function bankLine1(f: ReportModelFiling): string | null {
  const b = f.bank;
  if (!b) return null;
  return [b.bank_name, b.account_no ? `เลขที่บัญชี ${b.account_no}` : ""]
    .filter(Boolean)
    .join("  ·  ");
}

function bankLine2(f: ReportModelFiling): string | null {
  const b = f.bank;
  if (!b) return null;
  return [
    b.account_name ? `ชื่อบัญชี ${b.account_name}` : "",
    b.promptpay_id ? `พร้อมเพย์ ${b.promptpay_id}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
}

function renderCard(f: ReportModelFiling, index: number): string {
  const form = escapeHtml(f.form_code?.trim() || "-");
  const desc = f.description?.trim();
  const amount = `${escapeHtml(fmtMoney(f.amount))} บาท`;

  const l1 = bankLine1(f);
  const l2 = bankLine2(f);
  const custom = payLine(f);
  const hasPay = Boolean(l1 || l2 || custom);
  const qr = f.qrDataUri;
  const hasBody = Boolean(desc || hasPay || qr);

  const bodyCol = `
    <div class="col">
      ${desc ? `<div class="desc"><span class="lbl">รายละเอียด</span> ${escapeHtml(desc)}</div>` : ""}
      ${f.due_date ? `<div class="desc"><span class="lbl">กำหนดชำระ</span> ${escapeHtml(dateToThai(f.due_date))}</div>` : ""}
      ${
        hasPay || qr
          ? `<div class="divider"></div>
             <div class="pay">
               <span class="lbl">ช่องทางการชำระเงิน</span>
               ${l1 ? `<div class="payline">${escapeHtml(l1)}</div>` : ""}
               ${l2 ? `<div class="payline">${escapeHtml(l2)}</div>` : ""}
               ${custom ? `<div class="payline">${escapeHtml(custom)}</div>` : ""}
             </div>`
          : ""
      }
    </div>`;

  const qrCol = qr
    ? `<div class="qrbox"><img src="${qr}" alt="QR" /></div>`
    : "";

  return `
    <div class="card">
      <div class="head">
        <div class="head-left"><span class="idx">รายการที่ ${index + 1}</span><span class="form">${form}</span></div>
        <div class="amt">${amount}</div>
      </div>
      ${hasBody ? `<div class="body">${bodyCol}${qrCol}</div>` : ""}
    </div>`;
}

function uniqueBanks(model: ReportModel) {
  const seen = new Map<string, { key: string; label: string; qr: string | null; logo: string | null; lines: string[]; items: ReportModelFiling[] }>();
  for (const f of model.filings) {
    if (!f.bank && !f.qrDataUri && !f.payment_method) continue;
    const key = f.bank?.id ?? `qr-${f.id}`;
    if (!seen.has(key)) {
      const b = f.bank;
      const lines: string[] = [];
      if (b) {
        if (b.bank_name) lines.push(b.bank_name);
        if (b.account_no) lines.push(`เลขที่บัญชี ${b.account_no}`);
        if (b.account_name) lines.push(`ชื่อบัญชี ${b.account_name}`);
        if (b.promptpay_id) lines.push(`พร้อมเพย์ ${b.promptpay_id}`);
      }
      seen.set(key, {
        key,
        label: b?.label ?? f.form_code ?? "QR",
        qr: b?.qrDataUri ?? null,
        logo: b?.logoDataUri ?? b?.logoBottomDataUri ?? null,
        lines,
        items: [],
      });
    }
    const entry = seen.get(key)!;
    // A per-filing QR wins over the shared bank QR for the payment page.
    if (f.qrDataUri && !entry.qr) entry.qr = f.qrDataUri;
    entry.items.push(f);
  }
  return [...seen.values()];
}

function renderPaymentPage(model: ReportModel): string {
  const groups = uniqueBanks(model);
  if (!groups.length) return "";
  const blocks = groups
    .map((g) => {
      const logo = g.logo ? `<img class="banklogo" src="${g.logo}" alt="" />` : "";
      const subtotal = g.items.reduce((sum, f) => sum + Number(f.amount ?? 0), 0);
      const filenames = g.items
        .map(
          (f) =>
            `<li><span>${escapeHtml(f.form_code || "-")}</span><span class="muted">${escapeHtml(fmtMoney(f.amount))} บาท</span></li>`
        )
        .join("");
      const qr = g.qr
        ? `<div class="qrbig"><img src="${g.qr}" alt="QR" /></div>`
        : `<div class="qrbig qr-empty">ไม่พบ QR</div>`;
      return `
        <div class="paycard">
          <div class="paycard-info">
            <div class="paycard-title">${logo}${escapeHtml(g.lines[0] ?? g.label)}</div>
            ${g.lines.slice(1).map((l) => `<div class="paycard-line">${escapeHtml(l)}</div>`).join("")}
            <ul class="paycard-items">${filenames}</ul>
            <div class="paycard-subtotal"><span>รวมบัญชีนี้</span><span>${escapeHtml(fmtMoney(subtotal))} บาท</span></div>
          </div>
          ${qr}
        </div>`;
    })
    .join("");
  const grandTotal = groups.reduce(
    (sum, g) => sum + g.items.reduce((s, f) => s + Number(f.amount ?? 0), 0),
    0
  );
  return `
    <section class="page">
      <h2 class="section-title">ช่องทางการชำระเงิน</h2>
      <p class="muted">สแกนด้วยแอปธนาคาร หรือบันทึกภาพแล้วเลือกสแกนจากอัลบั้ม</p>
      ${blocks}
      <div class="grand-total"><span>ยอดรวมทั้งสิ้น</span><span>${escapeHtml(fmtMoney(grandTotal))} บาท</span></div>
      <div class="ref">อ้างอิงการชำระเงิน: ${escapeHtml(paymentRef(model))}</div>
      ${model.shareUrl ? `<div class="ref">ดูรายละเอียดและชำระเงินออนไลน์: <a href="${escapeHtml(model.shareUrl)}">${escapeHtml(model.shareUrl)}</a></div>` : ""}
    </section>`;
}

export type RenderHtmlOptions = { preview?: boolean };

export function renderReportHtml(model: ReportModel, opts: RenderHtmlOptions = {}): string {
  const periodTh = periodToThai(model.periodLabel);
  const title = `รายงานสรุปการนำส่งภาษีประจำเดือน ${periodTh}${
    model.reportLabel ? ` (${model.reportLabel})` : ""
  }`;
  const reportNo = model.reportNo?.trim() || `TW-${model.periodLabel.replace(/[^0-9]/g, "")}`;
  const logo = model.logoDataUri
    ? `<div class="logo"><img src="${model.logoDataUri}" alt="" /></div>`
    : "";
  const contact = [model.client.phone, model.client.email].filter(Boolean).join("  ·  ");
  const cards = model.filings.map((f, i) => renderCard(f, i)).join("");

  const cover = `
    <section class="page cover">
      ${logo}
      <div class="rule"></div>
      <h1 class="title">${escapeHtml(title)}</h1>
      <div class="title-bar"></div>

      <div class="client-card">
        <div class="client-name">${escapeHtml(model.client.name)}</div>
        ${model.client.tax_id ? `<div class="muted">เลขประจำตัวผู้เสียภาษีอากร: ${escapeHtml(model.client.tax_id)}</div>` : ""}
        ${model.client.address ? `<div>${escapeHtml(model.client.address)}</div>` : ""}
        ${contact ? `<div class="muted">${escapeHtml(contact)}</div>` : ""}
      </div>

      <div class="meta-grid">
        <div><div class="mlabel">เลขที่รายงาน</div><div class="mvalue">${escapeHtml(reportNo)}</div></div>
        <div><div class="mlabel">${model.reportLabel ? "ครั้งที่" : "รอบระยะเวลาภาษี"}</div><div class="mvalue">${escapeHtml(model.reportLabel || periodTh)}</div></div>
        <div><div class="mlabel">วันที่ออกรายงาน</div><div class="mvalue">${escapeHtml(model.issueDate)}</div></div>
        <div><div class="mlabel">จัดทำโดย</div><div class="mvalue">${escapeHtml(model.preparedBy)}</div></div>
      </div>

      <h2 class="section-title">รายละเอียดรายการภาษี</h2>
      ${cards || `<p class="muted">ไม่มีรายการ</p>`}
    </section>`;

  const payment = opts.preview ? "" : renderPaymentPage(model);

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<style>
${fontCss()}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Sarabun', sans-serif; color: #17171c; font-size: 9.5pt; line-height: 1.5; }
.page { width: 210mm; min-height: 297mm; padding: 14mm 12mm; page-break-after: always; position: relative; }
.page:last-child { page-break-after: auto; }
.muted { color: #73737d; }
.cover .logo { text-align: center; }
.cover .logo img { max-height: 46pt; max-width: 141pt; }
.rule { border-bottom: 1pt solid #242428; margin-top: 14pt; }
.title { font-size: 15pt; font-weight: 700; text-align: center; margin: 18pt 0 0; }
.title-bar { width: 88pt; height: 2.5pt; background: #242428; margin: 6pt auto 18pt; }
.client-card { background: #f7f7f8; border: 0.5pt solid #d1d1da; padding: 10pt 12pt; }
.client-name { font-size: 12pt; font-weight: 700; }
.meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); background: #f4f4f5; border: 0.5pt solid #d1d1da; margin-top: 10pt; }
.meta-grid > div { padding: 6pt 8pt; border-left: 0.5pt solid #d1d1da; }
.meta-grid > div:first-child { border-left: none; }
.mlabel { font-size: 8pt; color: #73737d; }
.mvalue { font-size: 9.5pt; font-weight: 700; }
.section-title { font-size: 11pt; font-weight: 700; margin: 12pt 0 6pt; }

.card { position: relative; border: 0.5pt solid #d1d1da; border-left: 2pt solid #242428; padding: 7pt 10pt; margin-bottom: 8pt; page-break-inside: avoid; }
.card .head { display: flex; justify-content: space-between; align-items: baseline; }
.card .idx { color: #73737d; font-weight: 700; margin-right: 6pt; }
.card .form { font-weight: 700; }
.card .amt { font-weight: 700; }
.card .body { display: flex; gap: 8pt; margin-top: 4pt; }
.card .col { flex: 1; min-width: 0; }
.card .desc { color: #73737d; }
.card .desc .lbl { color: #73737d; margin-right: 4pt; }
.card .divider { border-top: 0.5pt solid #d1d1da; margin: 6pt 0; }
.card .pay .lbl { color: #73737d; margin-right: 6pt; }
.card .payline { padding-left: 8pt; }
.card .qrbox { width: 44pt; height: 44pt; border: 0.5pt solid #d1d1da; padding: 2pt; background: #fff; }
.card .qrbox img { width: 100%; height: 100%; object-fit: contain; }

.paycard { display: flex; gap: 16pt; align-items: flex-start; border: 0.5pt solid #d1d1da; padding: 12pt; margin-bottom: 12pt; page-break-inside: avoid; }
.paycard-info { flex: 1; min-width: 0; }
.paycard-title { font-size: 11pt; font-weight: 700; display: flex; align-items: center; gap: 6pt; }
.paycard-title img { height: 12pt; }
.paycard-line { margin-top: 2pt; }
.paycard-items { list-style: none; padding: 0; margin: 8pt 0 0; border-top: 0.5pt solid #d1d1da; }
.paycard-items li { display: flex; justify-content: space-between; padding: 3pt 0; }
.paycard-subtotal { display: flex; justify-content: space-between; padding-top: 4pt; border-top: 0.5pt solid #d1d1da; font-weight: 700; }
.grand-total { display: flex; justify-content: space-between; font-size: 11pt; font-weight: 700; border-top: 1pt solid #242428; padding-top: 6pt; margin-top: 6pt; }
.qrbig { width: 150pt; height: 150pt; border: 0.5pt solid #d1d1da; padding: 6pt; background: #fff; display: flex; align-items: center; justify-content: center; }
.qrbig img { width: 100%; height: 100%; object-fit: contain; }
.qr-empty { color: #a1a1aa; font-size: 9pt; }
.ref { margin-top: 8pt; color: #73737d; font-size: 9pt; }
.ref a { color: #1d4ed8; text-decoration: underline; }
</style>
</head>
<body>
${cover}
${payment}
</body>
</html>`;
}

export const __testing = { fmtMoney, periodToThai, dateToThai, escapeHtml };
