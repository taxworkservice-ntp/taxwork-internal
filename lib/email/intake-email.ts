/**
 * Pure builder for the internal "new intake submission" notification email.
 */

import { INTAKE_TIMELINE_NOTE } from "@/lib/intake-shared";

export type IntakeNotifyInput = {
  name: string;
  juristicId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  reviewUrl: string;
};

export type IntakeNotifyEmail = { subject: string; html: string; text: string };

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildIntakeNotifyEmail(input: IntakeNotifyInput): IntakeNotifyEmail {
  const name = input.name.trim() || "(ไม่ระบุชื่อ)";
  const subject = `[จดทะเบียนบริษัท] ${name} — ${input.juristicId}`;
  const row = (label: string, value: string) =>
    `<div style="margin:0 0 4px;font-size:13px;color:#6b7280;">${esc(label)} <span style="color:#111827;">${esc(
      value
    )}</span></div>`;

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;font-family:'Sarabun','Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111827;">
  <p style="margin:0 0 16px;font-weight:600;">มีผู้ขอจดทะเบียนบริษัทใหม่</p>
  <div style="margin:0 0 16px;padding:14px 16px;background:#f9fafb;border:1px solid #eef0f2;border-radius:8px;">
    ${row("ชื่อบริษัท:", name)}
    ${row("เลขทะเบียนนิติบุคคล:", input.juristicId)}
    ${row("ผู้ติดต่อ:", input.contactName)}
    ${row("โทร:", input.contactPhone)}
    ${row("อีเมล:", input.contactEmail)}
  </div>
  <p style="margin:0 0 20px;"><a href="${esc(input.reviewUrl)}" style="display:inline-block;padding:10px 20px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">เปิดดูและตรวจสอบ</a></p>
  <p style="margin:0;font-size:12px;color:#9ca3af;">อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ</p>
</body></html>`;

  const text = [
    "มีผู้ขอจดทะเบียนบริษัทใหม่",
    "",
    `ชื่อบริษัท: ${name}`,
    `เลขทะเบียนนิติบุคคล: ${input.juristicId}`,
    `ผู้ติดต่อ: ${input.contactName}`,
    `โทร: ${input.contactPhone}`,
    `อีเมล: ${input.contactEmail}`,
    "",
    `เปิดดูและตรวจสอบ: ${input.reviewUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export type IntakeApprovedInput = {
  firmName: string;
  contactName: string;
  companyName: string;
  firmPhone?: string | null;
  firmLine?: string | null;
};

/** Courtesy "we received your registration" email sent to the prospect on approve. */
export function buildIntakeApprovedEmail(
  input: IntakeApprovedInput
): IntakeNotifyEmail {
  const firm = input.firmName.trim() || "Taxwork";
  const contact = input.contactName.trim() || "ท่าน";
  const company = input.companyName.trim() || "บริษัทของท่าน";
  const contactLine = [
    input.firmPhone ? `โทร ${input.firmPhone}` : "",
    input.firmLine ? `LINE ${input.firmLine}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  const subject = `${firm} — ได้รับข้อมูลจดทะเบียนบริษัทของ ${company} แล้ว`;

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;font-family:'Sarabun','Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111827;">
  <p style="margin:0 0 16px;font-size:17px;font-weight:600;">เรียน คุณ${esc(contact)}</p>
  <p style="margin:0 0 16px;color:#374151;">${esc(
    firm
  )} ได้รับข้อมูลเพื่อดำเนินการจดทะเบียนบริษัทของ ${esc(
    company
  )} เรียบร้อยแล้ว ขอบคุณที่ไว้วางใจใช้บริการของเรา เจ้าหน้าที่จะติดต่อกลับเพื่อดำเนินการขั้นต่อไปโดยเร็ว</p>
  ${
    contactLine
      ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;">ติดต่อเรา: ${esc(contactLine)}</p>`
      : ""
  }
  <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">${esc(INTAKE_TIMELINE_NOTE)}</p>
  <p style="margin:0 0 4px;">จึงเรียนมาเพื่อโปรดทราบ</p>
  <p style="margin:0 0 20px;font-weight:600;">${esc(firm)}</p>
  <p style="margin:0;font-size:12px;color:#9ca3af;">อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ</p>
</body></html>`;

  const text = [
    `เรียน คุณ${contact}`,
    "",
    `${firm} ได้รับข้อมูลเพื่อดำเนินการจดทะเบียนบริษัทของ ${company} เรียบร้อยแล้ว ขอบคุณที่ไว้วางใจใช้บริการของเรา เจ้าหน้าที่จะติดต่อกลับเพื่อดำเนินการขั้นต่อไปโดยเร็ว`,
    "",
    ...(contactLine ? [`ติดต่อเรา: ${contactLine}`, ""] : []),
    INTAKE_TIMELINE_NOTE,
    "",
    "จึงเรียนมาเพื่อโปรดทราบ",
    firm,
    "",
    "อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ",
  ].join("\n");

  return { subject, html, text };
}
