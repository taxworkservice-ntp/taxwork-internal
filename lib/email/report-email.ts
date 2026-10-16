/**
 * Pure builder for the client-facing report email. No server-only imports so
 * it can be unit-tested in isolation. All dynamic strings are HTML-escaped.
 *
 * Professional transactional layout: a letterhead (small logo + firm contact),
 * a document title, a reference block, a statement table with a bold total, and
 * a confidential footer. Inline CSS only, ~600px, kept tiny so it never clips.
 */

import { formatBaht } from "@/lib/report-format";

/** Hard cap on successful report emails per calendar month. */
export const REPORT_EMAIL_MONTHLY_LIMIT = 200;

const DEFAULT_BRAND_COLOR = "#111827";

export type ReportEmailItem = { label: string; amount: number };

export type ReportEmailInput = {
  firmName: string;
  firmPhone: string | null;
  firmLine: string | null;
  /** Firm brand colour (hex); falls back to a neutral dark. */
  brandColor: string | null;
  /** Small inline logo for the letterhead (already size-guarded); optional. */
  logoDataUri: string | null;
  clientName: string;
  periodTh: string;
  /** Round label as stored (e.g. "ครั้งที่ 1"), used verbatim. */
  reportLabel: string | null;
  reportNo: string | null;
  /** Issue date, Thai short form (e.g. "16 ต.ค. 2569"); optional. */
  issueDateTh: string | null;
  /** Itemised breakdown; falls back to a total-only line when empty. */
  items: ReportEmailItem[];
  /** Total amount due for the round; hidden when <= 0. */
  total: number;
};

export type ReportEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeColor(value: string | null): string {
  const v = value?.trim();
  return v && /^#?[0-9a-fA-F]{6}$/.test(v)
    ? v.startsWith("#")
      ? v
      : `#${v}`
    : DEFAULT_BRAND_COLOR;
}

export function buildReportEmail(input: ReportEmailInput): ReportEmail {
  const firm = input.firmName.trim() || "Taxwork";
  const client = input.clientName.trim() || "ลูกค้า";
  const period = input.periodTh.trim();
  const label = input.reportLabel?.trim() || null;
  const reportNo = input.reportNo?.trim() || null;
  const issueDate = input.issueDateTh?.trim() || null;
  const brand = normalizeColor(input.brandColor);
  const logo = input.logoDataUri?.trim() || null;
  const items = (input.items ?? []).filter((it) => it.label || it.amount);

  const firmContact = [
    input.firmPhone?.trim() ? `โทร ${input.firmPhone.trim()}` : "",
    input.firmLine?.trim() ? `LINE ${input.firmLine.trim()}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  const subject = `${firm} — รายงานสรุปการนำส่งภาษี ${period}${label ? ` ${label}` : ""}${
    reportNo ? ` (${reportNo})` : ""
  }`;

  const showTotal = Number.isFinite(input.total) && input.total > 0;

  const refRow = (caption: string, value: string) =>
    `<div style="margin:0 0 3px;font-size:12px;color:#6b7280;">${escapeHtml(
      caption
    )} <span style="color:#111827;">${escapeHtml(value)}</span></div>`;

  const refBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #eef0f2;border-radius:8px;margin:0 0 18px;">
    <tr><td style="padding:12px 14px;">
      ${reportNo ? refRow("เลขที่รายงาน", reportNo) : ""}
      ${refRow("รอบระยะเวลา", period)}
      ${label ? `<div style="margin:0 0 3px;font-size:12px;color:#6b7280;">${escapeHtml(label)}</div>` : ""}
      ${issueDate ? refRow("วันที่ออกรายงาน", issueDate) : ""}
    </td></tr>
  </table>`;

  const itemRow = (it: ReportEmailItem) =>
    `<tr>
      <td style="padding:5px 8px 5px 0;color:#374151;">${escapeHtml(it.label)}</td>
      <td style="padding:5px 0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:#111827;">${escapeHtml(
        formatBaht(it.amount)
      )}</td>
    </tr>`;

  const totalRow = `<tr>
      <td style="padding:8px 8px 0 0;border-top:2px solid #e5e7eb;font-weight:700;color:#111827;">รวม</td>
      <td style="padding:8px 0 0;border-top:2px solid #e5e7eb;text-align:right;white-space:nowrap;font-weight:700;color:${brand};">฿${escapeHtml(
        formatBaht(input.total)
      )}</td>
    </tr>`;

  const itemsBlock = items.length
    ? `<div style="font-size:13px;font-weight:600;margin:0 0 6px;">รายการที่ต้องชำระ <span style="font-weight:400;color:#6b7280;">(${items.length} รายการ)</span></div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
        <tr>
          <td style="padding:0 0 6px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">รายการ</td>
          <td style="padding:0 0 6px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:right;">จำนวนเงิน</td>
        </tr>
        ${items.map(itemRow).join("")}
        ${showTotal ? totalRow : ""}
      </table>`
    : showTotal
      ? `<p style="margin:0;color:#374151;">ยอดนำส่งรวม <strong style="color:#111827;">฿${escapeHtml(
          formatBaht(input.total)
        )}</strong></p>`
      : "";

  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-family:'Sarabun','Segoe UI',Tahoma,Arial,sans-serif;color:#111827;line-height:1.7;">
        <tr><td style="height:3px;background:${brand};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:20px 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${logo ? `<td style="vertical-align:middle;padding-right:12px;"><img src="${logo}" alt="" style="max-height:40px;max-width:150px;display:block;" /></td>` : ""}
            <td style="vertical-align:middle;">
              <div style="font-size:15px;font-weight:700;">${escapeHtml(firm)}</div>
              ${firmContact ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(firmContact)}</div>` : ""}
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:18px 24px 0;">
          <div style="font-size:18px;font-weight:700;">รายงานสรุปการนำส่งภาษี</div>
          <div style="font-size:14px;color:#6b7280;margin-top:2px;">ประจำเดือน ${escapeHtml(period)}${label ? ` · ${escapeHtml(label)}` : ""}</div>
        </td></tr>
        <tr><td style="padding:16px 24px 0;font-size:14px;">
          <p style="margin:0 0 12px;">เรียน ${escapeHtml(client)}</p>
          <p style="margin:0 0 18px;color:#374151;">รายงานสรุปการนำส่งภาษีประจำเดือน ${escapeHtml(
            period
          )} ของท่านได้จัดทำเรียบร้อยแล้ว เอกสารฉบับเต็มแนบมากับอีเมลนี้ เพื่อใช้ในการจัดเก็บและตรวจสอบ</p>
          ${refBlock}
          ${itemsBlock}
        </td></tr>
        <tr><td style="padding:20px 24px 24px;">
          <p style="margin:0;font-size:14px;">จึงเรียนมาเพื่อโปรดทราบ</p>
          <p style="margin:6px 0 0;font-size:14px;font-weight:600;">${escapeHtml(firm)}</p>
          ${firmContact ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(firmContact)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:12px 24px;border-top:1px solid #e5e7eb;background:#fafafa;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ · เอกสารนี้เป็นความลับสำหรับลูกค้าเท่านั้น</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    firm,
    firmContact ? firmContact : "",
    "",
    `รายงานสรุปการนำส่งภาษี ประจำเดือน ${period}${label ? ` · ${label}` : ""}`,
    "",
    `เรียน ${client}`,
    "",
    `รายงานสรุปการนำส่งภาษีประจำเดือน ${period} ของท่านได้จัดทำเรียบร้อยแล้ว เอกสารฉบับเต็มแนบมากับอีเมลนี้ เพื่อใช้ในการจัดเก็บและตรวจสอบ`,
    "",
  ];
  if (reportNo) textLines.push(`เลขที่รายงาน: ${reportNo}`);
  textLines.push(`รอบระยะเวลา: ${period}`);
  if (label) textLines.push(label);
  if (issueDate) textLines.push(`วันที่ออกรายงาน: ${issueDate}`);
  if (items.length) {
    textLines.push("", `รายการที่ต้องชำระ (${items.length} รายการ)`);
    for (const it of items) textLines.push(`- ${it.label} ${formatBaht(it.amount)}`);
  }
  if (showTotal) textLines.push("", `รวม ฿${formatBaht(input.total)}`);
  textLines.push(
    "",
    "จึงเรียนมาเพื่อโปรดทราบ",
    firm,
    firmContact ? firmContact : "",
    "",
    "อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ · เอกสารนี้เป็นความลับสำหรับลูกค้าเท่านั้น"
  );

  return { subject, html, text: textLines.join("\n") };
}
