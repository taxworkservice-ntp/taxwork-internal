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
  items: [
    { label: "ภ.พ.30 ภาษีมูลค่าเพิ่ม", amount: 12450 },
    { label: "ภ.ง.ด.1 ภาษีหัก ณ ที่จ่าย", amount: 3200 },
  ],
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
    expect(html).toContain("เลขที่รายงาน TW-6909-XK7P2M");
    expect(html).toContain("ครั้งที่ 1");
    expect(text).toContain("เลขที่รายงาน TW-6909-XK7P2M");
  });

  it("renders the item summary and total", () => {
    const { html, text } = buildReportEmail(base);
    expect(html).toContain("รายการที่ต้องชำระ (2)");
    expect(html).toContain("ภ.พ.30 ภาษีมูลค่าเพิ่ม");
    expect(html).toContain("12,450.00");
    expect(html).toContain("ภ.ง.ด.1 ภาษีหัก ณ ที่จ่าย");
    expect(html).toContain("3,200.00");
    expect(html).toContain(">รวม<");
    expect(html).toContain("15,650.00");
    expect(text).toContain("- ภ.พ.30 ภาษีมูลค่าเพิ่ม 12,450.00");
    expect(text).toContain("รวม ฿15,650.00");
  });

  it("falls back to a total-only line when there are no items", () => {
    const { html } = buildReportEmail({ ...base, items: [] });
    expect(html).not.toContain("รายการที่ต้องชำระ");
    expect(html).toContain("ยอดนำส่งรวม");
    expect(html).toContain("15,650.00");
  });

  it("hides the total when nothing is due", () => {
    const { html } = buildReportEmail({ ...base, total: 0 });
    expect(html).not.toContain("฿0.00");
    expect(html).not.toContain(">รวม<");
  });

  it("is an archival note: no button, link, attachment line, or reply invite", () => {
    const { html, text } = buildReportEmail(base);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("เปิดดูรายงาน");
    expect(html).not.toContain("เอกสารแนบ:");
    expect(text).not.toContain("http");
  });

  it("signs off with only the firm name", () => {
    const { html, text } = buildReportEmail(base);
    expect(html).toContain("จึงเรียนมาเพื่อโปรดทราบ");
    expect(html).not.toContain("คุณ");
    expect(html).not.toContain("ตอบกลับอีเมลนี้");
    expect(text).toContain(base.firmName);
  });

  it("escapes user-controlled strings in the HTML body", () => {
    const { html } = buildReportEmail({
      ...base,
      clientName: '<script>alert("x")</script>',
      items: [{ label: "<b>x</b>", amount: 100 }],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>x</b>");
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
