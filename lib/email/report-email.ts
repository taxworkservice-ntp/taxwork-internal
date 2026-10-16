/**
 * Pure builder for the client-facing report email. No server-only imports so
 * it can be unit-tested in isolation. All dynamic strings are HTML-escaped.
 *
 * Deliberately simple and flat — no inline/base64 images, buttons, links, or
 * heavy boxes — so it renders identically everywhere and Gmail never clips it.
 */

import { formatBaht } from "@/lib/report-format";

/** Hard cap on successful report emails per calendar month. */
export const REPORT_EMAIL_MONTHLY_LIMIT = 200;

export type ReportEmailItem = { label: string; amount: number };

export type ReportEmailInput = {
  firmName: string;
  clientName: string;
  periodTh: string;
  /** Round label as stored (e.g. "ครั้งที่ 1"), used verbatim. */
  reportLabel: string | null;
  reportNo: string | null;
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

export function buildReportEmail(input: ReportEmailInput): ReportEmail {
  const firm = input.firmName.trim() || "Taxwork";
  const client = input.clientName.trim() || "ลูกค้า";
  const label = input.reportLabel?.trim() || null;
  const reportNo = input.reportNo?.trim() || null;
  const period = input.periodTh.trim();
  const items = (input.items ?? []).filter((it) => it.label || it.amount);

  const subject = `${firm} — รายงานสรุปการนำส่งภาษี ${period}${label ? ` ${label}` : ""}${
    reportNo ? ` (${reportNo})` : ""
  }`;

  const showTotal = Number.isFinite(input.total) && input.total > 0;

  const itemRow = (it: ReportEmailItem) =>
    `<tr>
      <td style="padding:3px 8px 3px 0;color:#374151;">${escapeHtml(it.label)}</td>
      <td style="padding:3px 0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:#111827;">${escapeHtml(
        formatBaht(it.amount)
      )}</td>
    </tr>`;

  const totalRow = `<tr>
      <td style="padding:8px 8px 0 0;border-top:1px solid #e5e7eb;font-weight:600;color:#111827;">รวม</td>
      <td style="padding:8px 0 0;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap;font-weight:600;color:#111827;">฿${escapeHtml(
        formatBaht(input.total)
      )}</td>
    </tr>`;

  const itemsBlock = items.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
        <tr><td colspan="2" style="padding:0 0 6px;font-size:12px;color:#6b7280;">รายการที่ต้องชำระ (${items.length})</td></tr>
        ${items.map(itemRow).join("")}
        ${showTotal ? totalRow : ""}
      </table>`
    : showTotal
      ? `<p style="margin:0;color:#374151;">ยอดนำส่งรวม <strong style="color:#111827;">฿${escapeHtml(
          formatBaht(input.total)
        )}</strong></p>`
      : "";

  const refParts = [reportNo ? `เลขที่รายงาน ${reportNo}` : "", label ?? ""].filter(Boolean);
  const refLine = refParts.length
    ? `<p style="margin:18px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(
        refParts.join(" · ")
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
  <p style="margin:0 0 20px;color:#374151;">
    รายงานสรุปการนำส่งภาษีประจำเดือน ${escapeHtml(
      period
    )} ของท่านได้จัดทำเรียบร้อยแล้ว เอกสารฉบับเต็มแนบมากับอีเมลนี้ เพื่อใช้ในการจัดเก็บและตรวจสอบ
  </p>
  ${itemsBlock}
  ${refLine}
  <p style="margin:24px 0 4px;">จึงเรียนมาเพื่อโปรดทราบ</p>
  <p style="margin:0 0 20px;font-weight:600;">${escapeHtml(firm)}</p>
  <p style="margin:0;font-size:12px;color:#9ca3af;">อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ กรุณาเก็บไว้เป็นหลักฐาน</p>
</body>
</html>`;

  const textLines = [
    `เรียน ${client}`,
    "",
    `รายงานสรุปการนำส่งภาษีประจำเดือน ${period} ของท่านได้จัดทำเรียบร้อยแล้ว เอกสารฉบับเต็มแนบมากับอีเมลนี้ เพื่อใช้ในการจัดเก็บและตรวจสอบ`,
    "",
  ];
  if (items.length) {
    textLines.push(`รายการที่ต้องชำระ (${items.length})`);
    for (const it of items) textLines.push(`- ${it.label} ${formatBaht(it.amount)}`);
  }
  if (showTotal) textLines.push("", `รวม ฿${formatBaht(input.total)}`);
  if (refParts.length) textLines.push("", refParts.join(" · "));
  textLines.push(
    "",
    "จึงเรียนมาเพื่อโปรดทราบ",
    firm,
    "",
    "อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ กรุณาเก็บไว้เป็นหลักฐาน"
  );

  return { subject, html, text: textLines.join("\n") };
}
