import fs from "node:fs";
import path from "node:path";
import type { ReportModel, ReportModelBank, ReportModelFiling } from "@/lib/report-model";

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
  return custom || null;
}

/** Both bank logos (1 and 2), inline. */
function bankLogoImgs(b: ReportModelBank): string {
  const logos = [b.logoDataUri, b.logoBottomDataUri].filter(
    (x): x is string => Boolean(x)
  );
  if (!logos.length) return "";
  return `<span class="banklogos">${logos
    .map((src) => `<img src="${src}" alt="" />`)
    .join("")}</span>`;
}

/** Bank row: bank · account name (left), logos + เลขที่บัญชี (right). */
function bankInfoRow(b: ReportModelBank): string {
  const left = [b.bank_name, b.account_name ? `ชื่อบัญชี ${b.account_name}` : ""]
    .filter(Boolean)
    .join("  ·  ");
  const right = `${bankLogoImgs(b)}${
    b.account_no ? `<span class="acctno">เลขที่บัญชี ${escapeHtml(b.account_no)}</span>` : ""
  }`;
  if (!left && !right) return "";
  return `<div class="payrow"><span class="payleft">${escapeHtml(
    left
  )}</span><span class="payright">${right}</span></div>`;
}

function renderPayBlock(f: ReportModelFiling): string {
  const b = f.bank;
  const custom = payLine(f);
  if (!b && !custom) return "";
  const extra: string[] = [];
  if (b?.promptpay_id) extra.push(`พร้อมเพย์ ${b.promptpay_id}`);
  if (custom) extra.push(custom);
  return `<div class="divider"></div>
    <div class="pay">
      <span class="lbl">ช่องทางการชำระเงิน</span>
      ${b ? bankInfoRow(b) : ""}
      ${extra.map((l) => `<div class="payline">${escapeHtml(l)}</div>`).join("")}
    </div>`;
}

function renderCard(f: ReportModelFiling, index: number): string {
  const form = escapeHtml(f.form_code?.trim() || "-");
  const desc = f.description?.trim();
  const amount = `${escapeHtml(fmtMoney(f.amount))}<span class="unit"> บาท</span>`;

  const payBlock = renderPayBlock(f);
  const qr = f.qrDataUri;
  const hasBody = Boolean(payBlock || qr || f.due_date);

  const bodyCol = `
    <div class="col">
      ${f.due_date ? `<div class="desc"><span class="lbl">กำหนดชำระ</span> ${escapeHtml(dateToThai(f.due_date))}</div>` : ""}
      ${payBlock}
    </div>`;

  const qrCol = qr
    ? `<div class="qrbox"><img src="${qr}" alt="QR" /></div>`
    : "";

  return `
    <div class="card">
      <div class="head">
        <div class="head-left">
          <span class="idx">รายการที่ ${index + 1}</span>
          <span class="form">${form}</span>${desc ? `<span class="formdesc">(${escapeHtml(desc)})</span>` : ""}
        </div>
        <div class="amt">${amount}</div>
      </div>
      ${hasBody ? `<div class="body">${bodyCol}${qrCol}</div>` : ""}
    </div>`;
}

type BankGroup = {
  key: string;
  bankName: string;
  accountName: string;
  accountNo: string;
  promptpay: string | null;
  logos: string[];
  qr: string | null;
  items: ReportModelFiling[];
};

function uniqueBanks(model: ReportModel): BankGroup[] {
  const seen = new Map<string, BankGroup>();
  for (const f of model.filings) {
    if (!f.bank && !f.qrDataUri && !f.payment_method && !f.slips.length) continue;
    const key = f.bank?.id ?? `qr-${f.id}`;
    if (!seen.has(key)) {
      const b = f.bank;
      seen.set(key, {
        key,
        bankName: b?.bank_name || b?.label || f.form_code || "QR",
        accountName: b?.account_name || "",
        accountNo: b?.account_no || "",
        promptpay: b?.promptpay_id ?? null,
        logos: [b?.logoDataUri, b?.logoBottomDataUri].filter(
          (x): x is string => Boolean(x)
        ),
        qr: b?.qrDataUri ?? null,
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

function renderPaymentPage(
  model: ReportModel,
  slipPages?: Map<string, number>
): string {
  const groups = uniqueBanks(model);
  if (!groups.length) return "";
  const pageOf = (slipId: string, fallback: number | null) =>
    slipPages?.get(slipId) ?? fallback ?? null;
  const blocks = groups
    .map((g) => {
      const bankLeft = [g.bankName, g.accountName ? `ชื่อบัญชี ${g.accountName}` : ""]
        .filter(Boolean)
        .join("  ·  ");
      const bankRight = `${
        g.logos.length
          ? `<span class="banklogos">${g.logos
              .map((s) => `<img src="${s}" alt="" />`)
              .join("")}</span>`
          : ""
      }${g.accountNo ? `<span class="acctno">เลขที่บัญชี ${escapeHtml(g.accountNo)}</span>` : ""}`;
      const subtotal = g.items.reduce((sum, f) => sum + Number(f.amount ?? 0), 0);
      const filenames = g.items
        .map(
          (f) =>
            `<li><span>${escapeHtml(f.form_code || "-")}</span><span class="muted">${escapeHtml(fmtMoney(f.amount))} บาท</span></li>`
        )
        .join("");
      const slipRefs = g.items.flatMap((f) =>
        f.slips.map((s) => ({
          form: f.form_code,
          page: pageOf(s.id, s.pdfPage),
        }))
      );
      const slipHtml = slipRefs.length
        ? `<div class="paycard-slips">${slipRefs
            .map(
              (r) =>
                `<div>สลิปการชำระ${r.page ? ` หน้า ${r.page}` : ""}${
                  r.form ? ` · ${escapeHtml(r.form)}` : ""
                }</div>`
            )
            .join("")}</div>`
        : "";
      const qr = g.qr
        ? `<div class="qrbig"><img src="${g.qr}" alt="QR" /></div>`
        : slipRefs.length
          ? ""
          : `<div class="qrbig qr-empty">ไม่พบ QR</div>`;
      const payMethod = g.items
        .map((f) => f.payment_method?.trim())
        .filter((v): v is string => Boolean(v));
      const methodHtml = payMethod.length
        ? `<div class="paycard-line">วิธีชำระ: ${escapeHtml(
            Array.from(new Set(payMethod)).join(" · ")
          )}</div>`
        : "";
      return `
        <div class="paycard">
          <div class="paycard-info">
            <div class="payrow"><span class="payleft">${escapeHtml(bankLeft)}</span><span class="payright">${bankRight}</span></div>
            ${g.promptpay ? `<div class="paycard-line">พร้อมเพย์ ${escapeHtml(g.promptpay)}</div>` : ""}
            ${methodHtml}
            ${slipHtml}
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
    <section class="page" style="--brand:${brandHex(model.brandColor)}">
      <h2 class="section-title">ช่องทางการชำระเงิน</h2>
      <p class="muted">สแกนด้วยแอปธนาคาร หรือบันทึกภาพแล้วเลือกสแกนจากอัลบั้ม</p>
      ${blocks}
      <div class="grand-total"><span>ยอดรวมทั้งสิ้น</span><span>${escapeHtml(fmtMoney(grandTotal))} บาท</span></div>
      <div class="ref">อ้างอิงการชำระเงิน: ${escapeHtml(paymentRef(model))}</div>
      ${model.shareUrl ? `<div class="ref">ดูรายละเอียดและชำระเงินออนไลน์: <a href="${escapeHtml(model.shareUrl)}">${escapeHtml(model.shareUrl)}</a></div>` : ""}
    </section>`;
}

export type RenderHtmlOptions = { preview?: boolean };

const DOC_CSS = (): string => `
${fontCss()}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Sarabun', sans-serif; color: #17171c; font-size: 9.5pt; line-height: 1.5; }
.page { width: 210mm; min-height: 297mm; padding: 14mm 12mm; page-break-after: always; position: relative; }
.page:last-child { page-break-after: auto; }
.muted { color: #73737d; }
.letterhead { display: flex; align-items: center; gap: 10pt; }
.letterhead .brandlogo { max-height: 30pt; max-width: 120pt; object-fit: contain; }
.letterhead .firm { display: flex; flex-direction: column; }
.letterhead .firm-name { font-size: 12pt; font-weight: 700; }
.letterhead .firm-sub { font-size: 8.5pt; color: #73737d; margin-top: 1pt; }
.rule { border-bottom: 1pt solid var(--brand, #242428); margin-top: 12pt; }
.title { font-size: 15pt; font-weight: 700; text-align: center; margin: 18pt 0 0; }
.title-bar { width: 88pt; height: 2.5pt; background: var(--brand, #242428); margin: 6pt auto 18pt; }
.client-card { background: #f7f7f8; border: 0.5pt solid #d1d1da; padding: 10pt 12pt; }
.client-name { font-size: 12pt; font-weight: 700; }
.meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); background: #f4f4f5; border: 0.5pt solid #d1d1da; margin-top: 10pt; }
.meta-grid > div { padding: 6pt 8pt; border-left: 0.5pt solid #d1d1da; }
.meta-grid > div:first-child { border-left: none; }
.mlabel { font-size: 8pt; color: #73737d; }
.mvalue { font-size: 9.5pt; font-weight: 700; }
.section-title { font-size: 11pt; font-weight: 700; margin: 12pt 0 6pt; }

.card { position: relative; border: 0.5pt solid #d1d1da; border-left: 2pt solid var(--brand, #242428); padding: 7pt 10pt; margin-bottom: 8pt; page-break-inside: avoid; }
.card .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
.card .head-left { min-width: 0; }
.card .idx { color: #73737d; font-weight: 700; margin-right: 6pt; }
.card .form { font-weight: 700; }
.card .amt {
  font-size: 12pt;
  line-height: 1.1;
  font-weight: 700;
  color: var(--brand, #242428);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}
.card .amt .unit { font-size: 8.5pt; font-weight: 400; color: #73737d; }
.card .body { display: flex; gap: 8pt; margin-top: 4pt; }
.card .col { flex: 1; min-width: 0; }
.card .desc { color: #73737d; }
.card .desc .lbl { color: #73737d; margin-right: 4pt; }
.card .divider { border-top: 0.5pt solid #d1d1da; margin: 6pt 0; }
.card .pay .lbl { color: #73737d; margin-right: 6pt; }
.card .payline { padding-left: 8pt; }
.payrow { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; margin-top: 2pt; }
.payleft { min-width: 0; }
.payright { display: inline-flex; align-items: center; gap: 5pt; white-space: nowrap; flex-shrink: 0; }
.banklogos { display: inline-flex; align-items: center; gap: 4pt; }
.banklogos img { height: 14pt; max-width: 48pt; object-fit: contain; }
.acctno { font-size: 8pt; font-weight: 400; color: #52525b; font-variant-numeric: tabular-nums; }
.formdesc { color: #73737d; margin-left: 4pt; font-weight: 400; }
.card .qrbox { width: 44pt; height: 44pt; border: 0.5pt solid #d1d1da; padding: 2pt; background: #fff; }
.card .qrbox img { width: 100%; height: 100%; object-fit: contain; }

.paycard { display: flex; gap: 16pt; align-items: flex-start; border: 0.5pt solid #d1d1da; padding: 12pt; margin-bottom: 12pt; page-break-inside: avoid; }
.paycard-info { flex: 1; min-width: 0; }
.paycard-title { font-size: 11pt; font-weight: 700; display: flex; align-items: center; gap: 6pt; }
.paycard-title img { height: 16pt; max-width: 72pt; object-fit: contain; }
.paycard-line { margin-top: 2pt; }
.paycard-items { list-style: none; padding: 0; margin: 8pt 0 0; border-top: 0.5pt solid #d1d1da; }
.paycard-items li { display: flex; justify-content: space-between; padding: 3pt 0; }
.paycard-subtotal { display: flex; justify-content: space-between; padding-top: 4pt; border-top: 0.5pt solid #d1d1da; font-weight: 700; }
.paycard-slips { margin-top: 6pt; color: #1d4ed8; font-weight: 700; font-size: 9.5pt; }
.grand-total { display: flex; justify-content: space-between; font-size: 11pt; font-weight: 700; border-top: 1pt solid #242428; padding-top: 6pt; margin-top: 6pt; }
.qrbig { width: 150pt; height: 150pt; border: 0.5pt solid #d1d1da; padding: 6pt; background: #fff; display: flex; align-items: center; justify-content: center; }
.qrbig img { width: 100%; height: 100%; object-fit: contain; }
.qr-empty { color: #a1a1aa; font-size: 9pt; }
.ref { margin-top: 8pt; color: #73737d; font-size: 9pt; }
.ref a { color: #1d4ed8; text-decoration: underline; }
`;

function wrapHtml(body: string): string {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<style>
${DOC_CSS()}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function brandHex(value: string | null): string {
  const v = value?.trim();
  return v && /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : "#242428";
}

function renderCoverSection(model: ReportModel): string {
  const periodTh = periodToThai(model.periodLabel);
  const title = `รายงานสรุปการนำส่งภาษีประจำเดือน ${periodTh}${
    model.reportLabel ? ` (${model.reportLabel})` : ""
  }`;
  const reportNo = model.reportNo?.trim() || `TW-${model.periodLabel.replace(/[^0-9]/g, "")}`;
  const logo = model.logoDataUri
    ? `<img class="brandlogo" src="${model.logoDataUri}" alt="" />`
    : "";
  const firmContact = [
    model.firmPhone ? `โทร ${model.firmPhone}` : "",
    model.firmLine ? `LINE ${model.firmLine}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  const contact = [model.client.phone, model.client.email].filter(Boolean).join("  ·  ");
  const cards = model.filings.map((f, i) => renderCard(f, i)).join("");
  return `
    <section class="page cover" style="--brand:${brandHex(model.brandColor)}">
      <div class="letterhead">
        ${logo}
        <div class="firm">
          <div class="firm-name">${escapeHtml(model.firmName)}</div>
          ${firmContact ? `<div class="firm-sub">${escapeHtml(firmContact)}</div>` : ""}
        </div>
      </div>
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
}

/** Cover page only (used by the compose pipeline to measure cover length). */
export function renderCoverHtml(model: ReportModel): string {
  return wrapHtml(renderCoverSection(model));
}

/** Payment page only, with slip page references. Null when there is nothing to pay. */
export function renderPaymentHtml(
  model: ReportModel,
  slipPages?: Map<string, number>
): string | null {
  const payment = renderPaymentPage(model, slipPages);
  if (!payment) return null;
  return wrapHtml(payment);
}

/** Cover + payment in one document (preview / legacy callers / tests). */
export function renderReportHtml(model: ReportModel, opts: RenderHtmlOptions = {}): string {
  const cover = renderCoverSection(model);
  const payment = opts.preview ? "" : renderPaymentPage(model);
  return wrapHtml(`${cover}${payment}`);
}

export const __testing = { fmtMoney, periodToThai, dateToThai, escapeHtml };
