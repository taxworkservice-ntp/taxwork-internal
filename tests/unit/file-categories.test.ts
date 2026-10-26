import { describe, expect, it } from "vitest";
import {
  FILE_CATEGORY_GROUPS,
  fileCategoryLabel,
  normalizeFileCategory,
  splitClientFiles,
} from "@/lib/file-categories";

type TestFile = { id: string; category: string | null };

describe("normalizeFileCategory", () => {
  it("keeps known categories", () => {
    expect(normalizeFileCategory("company-certificate")).toBe(
      "company-certificate"
    );
    expect(normalizeFileCategory("tax")).toBe("tax");
  });

  it("falls back to other for null and unknown values", () => {
    expect(normalizeFileCategory(null)).toBe("other");
    expect(normalizeFileCategory(undefined)).toBe("other");
    expect(normalizeFileCategory("some-old-value")).toBe("other");
  });
});

describe("splitClientFiles", () => {
  const files: TestFile[] = [
    { id: "cert", category: "company-certificate" },
    { id: "none", category: null },
    { id: "report", category: "monthly-report" },
    { id: "tax", category: "tax" },
    { id: "unknown", category: "legacy-import" },
  ];

  it("separates system-generated report PDFs", () => {
    const { systemReports } = splitClientFiles(files);
    expect(systemReports.map((f) => f.id)).toEqual(["report"]);
  });

  it("places null and unknown categories into the other group", () => {
    const { groups } = splitClientFiles(files);
    const other = groups.find((g) => g.key === "other");
    expect(other?.files.map((f) => f.id)).toEqual(["none", "unknown"]);
  });

  it("groups known categories in the declared order", () => {
    const { groups } = splitClientFiles(files);
    expect(groups.map((g) => g.key)).toEqual(
      FILE_CATEGORY_GROUPS.map((g) => g.key)
    );
    expect(
      groups.find((g) => g.key === "company-certificate")?.files.map((f) => f.id)
    ).toEqual(["cert"]);
    expect(groups.find((g) => g.key === "tax")?.files.map((f) => f.id)).toEqual(
      ["tax"]
    );
  });
});

describe("fileCategoryLabel", () => {
  it("returns the Thai label for known categories", () => {
    expect(fileCategoryLabel("company-certificate")).toBe("หนังสือรับรองบริษัท");
    expect(fileCategoryLabel("tax")).toBe("เอกสารภาษี");
  });

  it("returns the fallback for null and unknown categories", () => {
    expect(fileCategoryLabel(null)).toBe("เอกสารอื่น ๆ");
    expect(fileCategoryLabel("legacy-import")).toBe("เอกสารอื่น ๆ");
  });
});
