import { describe, expect, it } from "vitest";
import {
  buildReportEmail,
  escapeHtml,
  REPORT_EMAIL_MONTHLY_LIMIT,
} from "@/lib/email/report-email";

const base = {
  firmName: "บริษัท แท็กซ์เวิร์ค จำกัด",
  brandColor: "#0f766e",
  clientName: "บริษัท ตัวอย่าง จำกัด",
  periodTh: "สิงหาคม 2569",
  reportNo: "TW-6908-7F3K9Q2M",
  total: 15650,
  shareUrl: "https://internal.taxworkaccount.com/r/tax-report-aug-2026-ABC123",
  attachmentName: "รายงานภาษี-สิงหาคม 2569.pdf",
};

describe("buildReportEmail", () => {
  it("builds a formal subject with firm, period, and report number", () => {
    const { subject } = buildReportEmail(base);
    expect(subject).toBe(
      "บริษัท แท็กซ์เวิร์ค จำกัด — รายงานสรุปการนำส่งภาษีประจำเดือน สิงหาคม 2569 (TW-6908-7F3K9Q2M)"
    );
  });

  it("omits the report number from the subject when absent", () => {
    const { subject } = buildReportEmail({ ...base, reportNo: null });
    expect(subject).not.toContain("(");
    expect(subject).toContain("สิงหาคม 2569");
  });

  it("greets the client and includes the share link and attachment", () => {
    const { html, text } = buildReportEmail(base);
    expect(html).toContain("เรียน บริษัท ตัวอย่าง จำกัด");
    expect(html).toContain(base.shareUrl);
    expect(html).toContain("เปิดดูรายงานออนไลน์");
    expect(html).toContain(base.attachmentName);
    expect(text).toContain(base.shareUrl);
  });

  it("signs off with only the firm name (no คุณ, no reply invitation)", () => {
    const { html, text } = buildReportEmail(base);
    expect(html).toContain("จึงเรียนมาเพื่อโปรดทราบ");
    expect(html).toContain(base.firmName);
    expect(html).not.toContain("คุณ");
    expect(html).not.toContain("ตอบกลับอีเมลนี้");
    expect(text).toContain("จึงเรียนมาเพื่อโปรดทราบ");
    expect(text).toContain(base.firmName);
  });

  it("shows the total amount line only when there is an amount due", () => {
    expect(buildReportEmail(base).html).toContain("ยอดนำส่งรวม");
    expect(buildReportEmail(base).html).toContain("15,650.00");
    expect(buildReportEmail({ ...base, total: 0 }).html).not.toContain("ยอดนำส่งรวม");
  });

  it("escapes user-controlled strings in the HTML body", () => {
    const { html } = buildReportEmail({
      ...base,
      clientName: '<script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("falls back to the default brand color for invalid values", () => {
    const { html } = buildReportEmail({ ...base, brandColor: "not-a-color" });
    expect(html).toContain("#111827");
  });

  it("exposes a 30-per-month limit", () => {
    expect(REPORT_EMAIL_MONTHLY_LIMIT).toBe(30);
  });
});

describe("escapeHtml", () => {
  it("escapes all sensitive characters", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
});
