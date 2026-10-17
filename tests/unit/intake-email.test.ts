import { describe, expect, it } from "vitest";
import {
  buildIntakeApprovedEmail,
  buildIntakeNotifyEmail,
} from "@/lib/email/intake-email";

describe("buildIntakeNotifyEmail", () => {
  it("includes the company and contact details", () => {
    const { subject, html, text } = buildIntakeNotifyEmail({
      name: "บริษัท ตัวอย่าง จำกัด",
      juristicId: "— (รอจดทะเบียน)",
      contactName: "คุณสมชาย",
      contactPhone: "0812345678",
      contactEmail: "a@b.com",
      reviewUrl: "https://internal.taxworkaccount.com/onboarding",
    });
    expect(subject).toContain("บริษัท ตัวอย่าง จำกัด");
    expect(html).toContain("รอจดทะเบียน");
    expect(html).toContain("https://internal.taxworkaccount.com/onboarding");
    expect(text).toContain("คุณสมชาย");
  });
});

describe("buildIntakeApprovedEmail", () => {
  it("greets the contact and names the firm + company", () => {
    const { subject, html, text } = buildIntakeApprovedEmail({
      firmName: "บริษัท แท็กซ์เวิร์ค จำกัด",
      contactName: "สมชาย",
      companyName: "บริษัท ตัวอย่าง จำกัด",
      firmPhone: "02-000-0000",
      firmLine: "@taxwork",
    });
    expect(subject).toContain("บริษัท แท็กซ์เวิร์ค จำกัด");
    expect(html).toContain("คุณสมชาย");
    expect(html).toContain("บริษัท ตัวอย่าง จำกัด");
    expect(html).toContain("โทร 02-000-0000");
    expect(text).toContain("LINE @taxwork");
  });
});

describe("shareholder percent rule", () => {
  function total(pcts: (string | number | null | undefined)[]): number | null {
    const vals = pcts.map((p) => {
      const t = String(p ?? "").trim().replace(/%/g, "");
      if (!t) return null;
      const n = Number(t.replace(/,/g, ""));
      return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
    });
    if (vals.some((v) => v == null || Number.isNaN(v))) return null;
    return (vals as number[]).reduce((a, b) => a + b, 0);
  }
  function ok(pcts: (string | number | null | undefined)[]): boolean {
    const t = total(pcts);
    return t != null && Math.abs(t - 100) < 0.01;
  }

  it("accepts percents totalling 100", () => {
    expect(ok(["50", "50"])).toBe(true);
    expect(ok(["33.33", "33.33", "33.34"])).toBe(true);
    expect(ok(["60%", "40%"])).toBe(true);
  });

  it("rejects missing, non-numeric, or non-100 totals", () => {
    expect(ok(["50", ""])).toBe(false);
    expect(ok(["60", "30"])).toBe(false);
    expect(ok(["abc", "50"])).toBe(false);
    expect(ok(["150", "-50"])).toBe(false);
  });
});
