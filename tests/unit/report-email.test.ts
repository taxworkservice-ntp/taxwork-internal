import { describe, expect, it } from "vitest";
import {
  buildReportEmail,
  escapeHtml,
  REPORT_EMAIL_MONTHLY_LIMIT,
} from "@/lib/email/report-email";

const base = {
  firmName: "บริษัท แท็กซ์เวิร์ค จำกัด",
  clientName: "บริษัท ตัวอย่าง จำกัด",
  periodTh: "กันยายน 2569",
  reportLabel: "ครั้งที่ 1",
  reportNo: "TW-6909-XK7P2M",
  total: 15650,
};

describe("buildReportEmail", () => {
  it("builds a formal subject with firm, period, round, and report number", () => {
    const { subject } = buildReportEmail(base);
    expect(subject).toBe(
      "บริษัท แท็กซ์เวิร์ค จำกัด — รายงานสรุปการนำส่งภาษี กันยายน 2569 ครั้งที่ 1 (TW-6909-XK7P2M)"
    );
  });

  it("omits the report number from the subject when absent", () => {
    const { subject } = buildReportEmail({ ...base, reportNo: null });
    expect(subject).not.toContain("(");
    expect(subject).toContain("กันยายน 2569");
  });

  it("greets the client and includes the reference block", () => {
    const { html, text } = buildReportEmail(base);
    expect(html).toContain("เรียน บริษัท ตัวอย่าง จำกัด");
    expect(html).toContain("เลขอ้างอิง:");
    expect(html).toContain("TW-6909-XK7P2M");
    expect(html).toContain("รอบระยะเวลา:");
    expect(html).toContain("ครั้งที่ 1");
    expect(html).toContain("ยอดนำส่งรวม:");
    expect(html).toContain("15,650.00");
    expect(text).toContain("เลขอ้างอิง: TW-6909-XK7P2M");
  });

  it("is an archival note: no button, link, attachment line, or reply invite", () => {
    const { html, text } = buildReportEmail(base);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("เปิดดูรายงาน");
    expect(html).not.toContain("เอกสารแนบ:");
    expect(html).not.toContain("ลิงก์");
    expect(text).not.toContain("http");
  });

  it("signs off with only the firm name", () => {
    const { html, text } = buildReportEmail(base);
    expect(html).toContain("จึงเรียนมาเพื่อโปรดทราบ");
    expect(html).not.toContain("คุณ");
    expect(html).not.toContain("ตอบกลับอีเมลนี้");
    expect(text).toContain(base.firmName);
  });

  it("hides the total line when there is no amount due", () => {
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

  it("exposes the 200-per-month limit", () => {
    expect(REPORT_EMAIL_MONTHLY_LIMIT).toBe(200);
  });
});

describe("escapeHtml", () => {
  it("escapes all sensitive characters", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
});
