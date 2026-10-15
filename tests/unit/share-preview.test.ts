import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_PREVIEW_TITLE,
  buildSharePreview,
  defaultSharePreviewDescription,
} from "@/lib/share-preview";

describe("buildSharePreview", () => {
  it("uses defaults when nothing is configured", () => {
    expect(buildSharePreview()).toEqual({
      title: DEFAULT_SHARE_PREVIEW_TITLE,
      description: defaultSharePreviewDescription(undefined),
    });
  });

  it("includes the firm name in the default description", () => {
    const { description } = buildSharePreview({ firmName: "หจก. ทดสอบ" });
    expect(description).toContain("หจก. ทดสอบ");
  });

  it("prefers configured title/description and trims whitespace", () => {
    expect(
      buildSharePreview({ title: "  หัวข้อ  ", description: "  คำอธิบาย  ", firmName: "X" })
    ).toEqual({ title: "หัวข้อ", description: "คำอธิบาย" });
  });

  it("falls back to defaults when only whitespace is configured", () => {
    const preview = buildSharePreview({ title: "   ", description: "   ", firmName: "X" });
    expect(preview.title).toBe(DEFAULT_SHARE_PREVIEW_TITLE);
    expect(preview.description).toContain("X");
  });
});

describe("buildSharePreview detail levels", () => {
  const fields = {
    firmName: "บริษัท แท็กซ์เวิร์ค จำกัด",
    periodTh: "กันยายน 2569",
    label: "ครั้งที่ 1",
    clientName: "บริษัท ตัวอย่าง จำกัด",
    total: 15650,
  };

  it("none: keeps the generic title and description", () => {
    const p = buildSharePreview({ ...fields, detail: "none" });
    expect(p.title).toBe(DEFAULT_SHARE_PREVIEW_TITLE);
    expect(p.description).not.toContain("ยอดนำส่งรวม");
    expect(p.description).not.toContain("บริษัท ตัวอย่าง");
  });

  it("period: adds period + round to the title only", () => {
    const p = buildSharePreview({ ...fields, detail: "period" });
    expect(p.title).toBe("รายงานภาษี กันยายน 2569 ครั้งที่ 1");
    expect(p.title).not.toContain("บริษัท ตัวอย่าง");
    expect(p.description).not.toContain("ยอดนำส่งรวม");
  });

  it("client: adds the client name to the title", () => {
    const p = buildSharePreview({ ...fields, detail: "client" });
    expect(p.title).toContain("บริษัท ตัวอย่าง จำกัด");
    expect(p.description).not.toContain("ยอดนำส่งรวม");
  });

  it("amount: adds the total to the description", () => {
    const p = buildSharePreview({ ...fields, detail: "amount" });
    expect(p.title).toContain("บริษัท ตัวอย่าง จำกัด");
    expect(p.description).toContain("ยอดนำส่งรวม");
    expect(p.description).toContain("15,650.00");
  });

  it("configured title/description override the level detail", () => {
    const p = buildSharePreview({ ...fields, detail: "amount", title: "ของฉัน", description: "คำอธิบาย" });
    expect(p.title).toBe("ของฉัน");
    expect(p.description).toBe("คำอธิบาย");
  });
});
