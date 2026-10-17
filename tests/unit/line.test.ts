import { describe, expect, it } from "vitest";
import { adminLineRecipients, buildIntakeLineText } from "@/lib/line";

describe("buildIntakeLineText", () => {
  it("builds a short 3-line Thai summary", () => {
    const text = buildIntakeLineText({
      company: "บริษัท ตัวอย่าง จำกัด",
      contactName: "สมชาย",
      contactPhone: "0812345678",
      ref: "INT-AB12CD",
      reviewUrl: "https://internal.taxworkaccount.com/onboarding",
    });
    const lines = text.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("บริษัท ตัวอย่าง จำกัด");
    expect(lines[1]).toContain("สมชาย");
    expect(lines[1]).toContain("INT-AB12CD");
    expect(lines[2]).toContain("https://internal.taxworkaccount.com/onboarding");
  });

  it("falls back to a placeholder company name", () => {
    expect(buildIntakeLineText({ company: "  ", contactName: "a", contactPhone: "b", ref: "r", reviewUrl: "u" })).toContain(
      "(ไม่ระบุชื่อ)"
    );
  });
});

describe("adminLineRecipients", () => {
  it("parses comma-separated ids", () => {
    process.env.ADMIN_LINE_USER_IDS = "Uaaa, Ubbb ,";
    expect(adminLineRecipients()).toEqual(["Uaaa", "Ubbb"]);
    delete process.env.ADMIN_LINE_USER_IDS;
  });

  it("returns empty when unset", () => {
    delete process.env.ADMIN_LINE_USER_IDS;
    expect(adminLineRecipients()).toEqual([]);
  });
});
