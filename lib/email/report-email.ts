/**
 * Pure builder for the client-facing report email. No server-only imports so
 * it can be unit-tested in isolation. All dynamic strings are HTML-escaped.
 *
 * This is an *archival delivery* note: the report travels as a PDF attachment
 * and the body just identifies it (reference block). Deliberately small — no
 * inline/base64 images, buttons, or links — so Gmail doesn't clip it.
 */

import { formatBaht } from "@/lib/report-format";

/** Hard cap on successful report emails per calendar month. */
export const REPORT_EMAIL_MONTHLY_LIMIT = 200;

export type ReportEmailInput = {
  firmName: string;
  clientName: string;
  periodTh: string;
  /** Round label as stored (e.g. "ครั้งที่ 1"), used verbatim. */
  reportLabel: string | null;
  reportNo: string | null;
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

export function buildReportEmail(input: ReportEmailInput): ReportEmail {
  const firm = input.firmName.trim() || "Taxwork";
  const client = input.clientName.trim() || "ลูกค้า";
  const label = input.reportLabel?.trim() || null;
  const reportNo = input.reportNo?.trim() || null;
  const period = input.periodTh.trim();

  const subject = `${firm} — รายงานสรุปการนำส่งภาษี ${period}${label ? ` ${label}` : ""}${
    reportNo ? ` (${reportNo})` : ""
  }`;

  const showTotal = Number.isFinite(input.total) && input.total > 0;
  const refRow = (caption: string, value: string) =>
    `<div style="margin:0 0 3px;font-size:13px;color:#6b7280;">${escapeHtml(
      caption
    )} <span style="color:#111827;">${escapeHtml(value)}</span></div>`;

  const refBlock = `<div style="margin:0 0 20px;padding:14px 16px;background:#f9fafb;border:1px solid #eef0f2;border-radius:8px;">
${reportNo ? refRow("เลขอ้างอิง:", reportNo) : ""}
${refRow("รอบระยะเวลา:", period)}
${label ? `<div style="margin:0 0 3px;font-size:13px;color:#6b7280;">${escapeHtml(label)}</div>` : ""}
${showTotal ? refRow("ยอดนำส่งรวม:", `฿${formatBaht(input.total)}`) : ""}
</div>`;

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
    รายงานสรุปการนำส่งภาษีประจำเดือน ${escapeHtml(
      period
    )} ของท่านได้จัดทำเรียบร้อยแล้ว เอกสารฉบับเต็มแนบมากับอีเมลนี้ เพื่อใช้ในการจัดเก็บและตรวจสอบ
  </p>
  ${refBlock}
  <p style="margin:0 0 4px;">จึงเรียนมาเพื่อโปรดทราบ</p>
  <p style="margin:0 0 20px;font-weight:600;">${escapeHtml(firm)}</p>
  <p style="margin:0;color:#9ca3af;font-size:12px;">อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ กรุณาเก็บไว้เป็นหลักฐาน</p>
</body>
</html>`;

  const textLines = [
    `เรียน ${client}`,
    "",
    `รายงานสรุปการนำส่งภาษีประจำเดือน ${period} ของท่านได้จัดทำเรียบร้อยแล้ว เอกสารฉบับเต็มแนบมากับอีเมลนี้ เพื่อใช้ในการจัดเก็บและตรวจสอบ`,
    "",
  ];
  if (reportNo) textLines.push(`เลขอ้างอิง: ${reportNo}`);
  textLines.push(`รอบระยะเวลา: ${period}`);
  if (label) textLines.push(label);
  if (showTotal) textLines.push(`ยอดนำส่งรวม: ฿${formatBaht(input.total)}`);
  textLines.push(
    "",
    "จึงเรียนมาเพื่อโปรดทราบ",
    firm,
    "",
    "อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ กรุณาเก็บไว้เป็นหลักฐาน"
  );

  return { subject, html, text: textLines.join("\n") };
}
