import { describe, expect, it } from "vitest";
import {
  buildIntakeApprovedEmail,
  buildIntakeNotifyEmail,
} from "@/lib/email/intake-email";

describe("buildIntakeNotifyEmail", () => {
  it("includes the company, tax id and contact details", () => {
    const { subject, html, text } = buildIntakeNotifyEmail({
      name: "บริษัท ตัวอย่าง จำกัด",
      juristicId: "0-2755-66001-61-9",
      contactName: "คุณสมชาย",
      contactPhone: "0812345678",
      contactEmail: "a@b.com",
      reviewUrl: "https://internal.taxworkaccount.com/onboarding",
    });
    expect(subject).toContain("บริษัท ตัวอย่าง จำกัด");
    expect(html).toContain("0-2755-66001-61-9");
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
