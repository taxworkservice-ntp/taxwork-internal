/**
 * Pure builder for the client-facing report email. No server-only imports so
 * it can be unit-tested in isolation. All dynamic strings are HTML-escaped.
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
  logoDataUri: string | null;
  clientName: string;
  periodTh: string;
  reportNo: string | null;
  /** Total amount due for the round; hidden when <= 0. */
  total: number;
  shareUrl: string;
  /** Direct download of the attached PDF, shown as the filename. */
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
    ? `<p style="margin:0 0 20px;font-size:15px;color:#111827;">ยอดนำส่งรวม <strong>฿${formatBaht(
        input.total
      )}</strong></p>`
    : "";

  const logo = input.logoDataUri
    ? `<img src="${input.logoDataUri}" alt="${escapeHtml(firm)}" style="max-height:44px;max-width:220px;display:block;" />`
    : `<span style="font-size:18px;font-weight:700;color:#ffffff;">${escapeHtml(firm)}</span>`;

  const contactParts = [firm];
  if (input.firmPhone?.trim()) contactParts.push(`โทร ${input.firmPhone.trim()}`);
  if (input.firmLine?.trim()) contactParts.push(`LINE ${input.firmLine.trim()}`);
  const contactLine = contactParts.map((p) => escapeHtml(p)).join(" · ");
  const addressLine = input.firmAddress?.trim()
    ? `<div style="color:#6b7280;font-size:12px;line-height:1.6;">${escapeHtml(
        input.firmAddress.trim()
      )}</div>`
    : "";

  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Sarabun','Segoe UI',Tahoma,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${color};padding:20px 28px;">
              ${logo}
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:16px;font-weight:600;">เรียน ${escapeHtml(client)}</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">
                ทาง ${escapeHtml(firm)} ได้จัดทำรายงานสรุปการนำส่งภาษีประจำเดือน ${escapeHtml(
                  input.periodTh
                )} เรียบร้อยแล้ว
                ท่านสามารถเปิดดูรายละเอียดออนไลน์ หรือเปิดไฟล์ PDF ที่แนบมากับอีเมลนี้ได้เลย
              </p>
              ${amountLine}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" bgcolor="${color}" style="border-radius:8px;">
                    <a href="${escapeHtml(input.shareUrl)}" target="_blank"
                       style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      เปิดดูรายงานออนไลน์ →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                📎 เอกสารแนบ: ${escapeHtml(input.attachmentName)}
              </p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
                ลิงก์เปิดดูออนไลน์มีอายุ 7 วัน และต้องยืนยันตัวตนด้วยเลขท้าย 4 หลักของเลขประจำตัวผู้เสียภาษี
                หากลิงก์หมดอายุ กรุณาติดต่อเจ้าหน้าที่
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #e5e7eb;background:#fafafa;">
              <p style="margin:0 0 4px;font-size:14px;color:#374151;">จึงเรียนมาเพื่อโปรดทราบ</p>
              <p style="margin:12px 0 2px;font-size:14px;font-weight:600;color:#111827;">คุณ${escapeHtml(
                preparedBy
              )}</p>
              <div style="font-size:12px;color:#6b7280;line-height:1.6;">${contactLine}</div>
              ${addressLine}
              <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">
                ตอบกลับอีเมลนี้ได้เลยหากมีข้อสงสัย
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    `เรียน ${client}`,
    "",
    `ทาง ${firm} ได้จัดทำรายงานสรุปการนำส่งภาษีประจำเดือน ${input.periodTh} เรียบร้อยแล้ว`,
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
  if (addressLine) textLines.push(input.firmAddress!.trim());
  textLines.push("ตอบกลับอีเมลนี้ได้เลยหากมีข้อสงสัย");

  return { subject, html, text: textLines.join("\n") };
}
