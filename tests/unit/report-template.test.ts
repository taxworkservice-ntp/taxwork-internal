import { describe, expect, it } from "vitest";
import {
  renderReportHtml,
  __testing,
} from "@/lib/report-pdf/server/template";
import { SAMPLE_QR, sampleModel as baseModel } from "@/tests/fixtures/model";

describe("report template (server renderer)", () => {
  it("uses formal Thai wording", () => {
    const html = renderReportHtml(baseModel());
    expect(html).toContain("รายงานสรุปการนำส่งภาษีประจำเดือน สิงหาคม 2569 (ครั้งที่ 1)");
    expect(html).toContain("เลขประจำตัวผู้เสียภาษีอากร");
    expect(html).toContain("วันที่ออกรายงาน");
    expect(html).toContain("จัดทำโดย");
    expect(html).toContain("รายละเอียดรายการภาษี");
  });

  it("renders one statement card per filing with formal labels", () => {
    const html = renderReportHtml(baseModel());
    expect(html).toContain("รายการที่ 1");
    expect(html).toContain("ภ.พ.30");
    expect(html).toContain("5,000.00 บาท");
    expect(html).toContain("รายละเอียด");
    expect(html).toContain("ช่องทางการชำระเงิน");
    expect(html).toContain("เลขที่บัญชี 164-3-84594-2");
    expect(html).toContain("พร้อมเพย์ 0810000000");
    // QR image embedded
    expect(html).toContain(SAMPLE_QR);
  });

  it("includes a dedicated payment page unless preview", () => {
    const instruction = "สแกนด้วยแอปธนาคาร";
    expect(renderReportHtml(baseModel())).toContain(instruction);
    expect(renderReportHtml(baseModel(), { preview: true })).not.toContain(instruction);
  });

  it("shows due dates and payment totals", () => {
    const html = renderReportHtml(baseModel());
    expect(html).toContain("กำหนดชำระ");
    expect(html).toContain("15 ก.ย. 2569");
    expect(html).toContain("ยอดรวมทั้งสิ้น");
    // 5,000.00 appears as the filing amount, account subtotal and grand total.
    expect(html.match(/5,000\.00/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("renders the share link on the payment page when present", () => {
    const url = "https://internal.taxworkaccount.com/r/ABCDEFGHIJKLMNOPQRST";
    const html = renderReportHtml(baseModel({ shareUrl: url }));
    expect(html).toContain(`href="${url}"`);
    const none = renderReportHtml(baseModel({ shareUrl: null }));
    expect(none).not.toContain("/r/ABCDEFGHIJKLMNOPQRST");
  });

  it("falls back to รอบระยะเวลาภาษี when there is no round label", () => {
    const html = renderReportHtml(baseModel({ reportLabel: null }));
    expect(html).toContain("รอบระยะเวลาภาษี");
  });

  it("escapes HTML in user content", () => {
    expect(__testing.escapeHtml("<b>&\"'")).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });

  it("formats money and Thai dates", () => {
    expect(__testing.fmtMoney(1234.5)).toBe("1,234.50");
    expect(__testing.periodToThai("2026-08")).toBe("สิงหาคม 2569");
    expect(__testing.dateToThai("2026-09-15")).toBe("15 ก.ย. 2569");
    expect(__testing.dateToThai(null)).toBe("-");
  });
});
