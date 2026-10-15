/**
 * Pure builder for the client-facing report email. No server-only imports so
 * it can be unit-tested in isolation. All dynamic strings are HTML-escaped.
 *
 * Kept deliberately small (no inline/base64 images) so Gmail doesn't clip the
 * message; the report travels as a PDF attachment plus a share link.
 */

import { formatBaht } from "@/lib/report-format";

/** Hard cap on successful report emails per calendar month. */
export const REPORT_EMAIL_MONTHLY_LIMIT = 30;

const DEFAULT_BRAND_COLOR = "#111827";

export type ReportEmailInput = {
  firmName: string;
  preparedBy: string | null;
  firmPhone: string | null;
  firmLine: string | null;
  firmAddress: string | null;
  brandColor: string | null;
  clientName: string;
  periodTh: string;
  reportNo: string | null;
  /** Total amount due for the round; hidden when <= 0. */
  total: number;
  shareUrl: string;
  /** Name of the attached PDF, shown in the body. */
  attachmentName: string;
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
  return v && /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : DEFAULT_BRAND_COLOR;
}

export function buildReportEmail(input: ReportEmailInput): ReportEmail {
  const firm = input.firmName.trim() || "Taxwork";
  const client = input.clientName.trim() || "ลูกค้า";
  const color = normalizeColor(input.brandColor);
  const reportNo = input.reportNo?.trim() || null;
  const preparedBy = input.preparedBy?.trim() || firm;

  const subject = reportNo
    ? `${firm} — รายงานสรุปการนำส่งภาษีประจำเดือน ${input.periodTh} (${reportNo})`
    : `${firm} — รายงานสรุปการนำส่งภาษีประจำเดือน ${input.periodTh}`;

  const showAmount = Number.isFinite(input.total) && input.total > 0;
  const amountLine = showAmount
    ? `<p style="margin:0 0 16px;">ยอดนำส่งรวม <strong>฿${formatBaht(input.total)}</strong></p>`
    : "";

  const contactParts = [firm];
  if (input.firmPhone?.trim()) contactParts.push(`โทร ${input.firmPhone.trim()}`);
  if (input.firmLine?.trim()) contactParts.push(`LINE ${input.firmLine.trim()}`);
  const contactLine = contactParts.map((p) => escapeHtml(p)).join(" · ");
  const addressLine = input.firmAddress?.trim()
    ? `<p style="margin:0 0 4px;color:#6b7280;font-size:13px;">${escapeHtml(
        input.firmAddress.trim()
      )}</p>`
    : "";

  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:'Sarabun','Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111827;">
  <p style="margin:0 0 16px;font-size:17px;font-weight:600;">เรียน ${escapeHtml(client)}</p>
  <p style="margin:0 0 16px;color:#374151;">
    ทาง ${escapeHtml(firm)} ได้จัดทำรายงานสรุปการนำส่งภาษีประจำเดือน ${escapeHtml(
      input.periodTh
    )} เรียบร้อยแล้ว รายละเอียดตามไฟล์ที่แนบมากับอีเมลนี้
  </p>
  ${amountLine}
  <p style="margin:0 0 20px;">
    <a href="${escapeHtml(input.shareUrl)}" target="_blank"
       style="display:inline-block;padding:11px 24px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;background:${color};">
      เปิดดูรายงานออนไลน์
    </a>
  </p>
  <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">เอกสารแนบ: ${escapeHtml(
    input.attachmentName
  )}</p>
  <p style="margin:0 0 24px;color:#9ca3af;font-size:12px;">
    ลิงก์มีอายุ 7 วัน และต้องยืนยันตัวตนด้วยเลขท้าย 4 หลักของเลขประจำตัวผู้เสียภาษี
    หากลิงก์หมดอายุ กรุณาติดต่อเจ้าหน้าที่
  </p>
  <p style="margin:0 0 4px;">จึงเรียนมาเพื่อโปรดทราบ</p>
  <p style="margin:0 0 4px;font-weight:600;">คุณ${escapeHtml(preparedBy)}</p>
  <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">${contactLine}</p>
  ${addressLine}
  <p style="margin:8px 0 0;color:#6b7280;font-size:13px;">ตอบกลับอีเมลนี้ได้เลยหากมีข้อสงสัย</p>
</body>
</html>`;

  const textLines = [
    `เรียน ${client}`,
    "",
    `ทาง ${firm} ได้จัดทำรายงานสรุปการนำส่งภาษีประจำเดือน ${input.periodTh} เรียบร้อยแล้ว รายละเอียดตามไฟล์ที่แนบมากับอีเมลนี้`,
    "",
  ];
  if (showAmount) textLines.push(`ยอดนำส่งรวม ฿${formatBaht(input.total)}`, "");
  textLines.push(
    `เปิดดูรายงานออนไลน์: ${input.shareUrl}`,
    "",
    `เอกสารแนบ: ${input.attachmentName}`,
    "(ลิงก์มีอายุ 7 วัน และต้องยืนยันตัวตนด้วยเลขท้าย 4 หลักของเลขประจำตัวผู้เสียภาษี)",
    "",
    "จึงเรียนมาเพื่อโปรดทราบ",
    "",
    `คุณ${preparedBy}`,
    contactParts.join(" · ")
  );
  if (input.firmAddress?.trim()) textLines.push(input.firmAddress.trim());
  textLines.push("ตอบกลับอีเมลนี้ได้เลยหากมีข้อสงสัย");

  return { subject, html, text: textLines.join("\n") };
}
