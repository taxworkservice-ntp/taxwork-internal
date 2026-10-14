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
