import { describe, expect, it } from "vitest";
import { maskEmail } from "@/lib/report-format";

describe("maskEmail", () => {
  it("masks the local part and keeps the domain recognisable", () => {
    expect(maskEmail("somchai@example.com")).toBe("so*****@example.com");
  });

  it("always shows at least three mask characters", () => {
    expect(maskEmail("ab@example.com")).toBe("ab***@example.com");
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  it("trims surrounding whitespace before masking", () => {
    expect(maskEmail("  user@example.com  ")).toBe("us***@example.com");
  });

  it("returns values that are not usable email addresses unchanged", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
    expect(maskEmail("@example.com")).toBe("@example.com");
    expect(maskEmail("user@")).toBe("user@");
  });
});
