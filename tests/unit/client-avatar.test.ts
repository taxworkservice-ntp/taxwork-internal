import { describe, expect, it } from "vitest";
import {
  clientInitials,
  contrastText,
  normalizeHex,
  normalizeInitials,
  resolveInitials,
} from "@/lib/client-avatar";

describe("normalizeInitials", () => {
  it("uppercases English letters and strips everything else", () => {
    expect(normalizeInitials(" dtn ")).toBe("DTN");
    expect(normalizeInitials("a-b.c")).toBe("ABC");
    expect(normalizeInitials("ภาษี")).toBe("");
  });

  it("keeps at most 4 characters", () => {
    expect(normalizeInitials("ABCDE")).toBe("ABCD");
  });

  it("returns empty for blank input", () => {
    expect(normalizeInitials(null)).toBe("");
    expect(normalizeInitials("  ")).toBe("");
  });
});

describe("clientInitials", () => {
  it("returns nothing for a purely Thai name", () => {
    expect(clientInitials("บริษัท ไดฟ์ เทอร์มินอล จำกัด")).toBe("");
  });

  it("derives Latin initials and drops suffix words", () => {
    expect(clientInitials("Drive Terminal Co., Ltd.")).toBe("DT");
    expect(clientInitials("Acme Holdings Inc")).toBe("A");
  });

  it("uses only the Latin words of a mixed name", () => {
    expect(clientInitials("บริษัท ABC Trading จำกัด")).toBe("AT");
  });

  it("returns empty for an empty name", () => {
    expect(clientInitials("")).toBe("");
  });
});

describe("normalizeHex", () => {
  it("expands #rgb and lowercases", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
  });

  it("rejects invalid values", () => {
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe("contrastText", () => {
  it("uses dark text on light backgrounds and white on dark", () => {
    expect(contrastText("#ffffff")).toBe("#171717");
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(contrastText("#2563eb")).toBe("#ffffff");
  });
});

describe("resolveInitials", () => {
  it("prefers the configured abbreviation", () => {
    expect(resolveInitials("บริษัท ไดฟ์ เทอร์มินอล จำกัด", "DTN")).toBe("DTN");
  });

  it("falls back to the name when no abbreviation is set", () => {
    expect(resolveInitials("Drive Terminal Co., Ltd.", null)).toBe("DT");
  });
});
