import { describe, expect, it } from "vitest";
import { checkTaxId, formatTaxId, isValidTaxId, taxIdDigits } from "@/lib/tax-id";

describe("tax-id", () => {
  it("strips non-digits", () => {
    expect(taxIdDigits("0-2755-66001-61-9")).toBe("0275566001619");
  });

  it("formats 13 digits as 0-0000-00000-00-0", () => {
    expect(formatTaxId("0275566001619")).toBe("0-2755-66001-61-9");
  });

  it("returns the trimmed input when not 13 digits", () => {
    expect(formatTaxId("1234")).toBe("1234");
  });

  it("accepts a valid 13-digit tax id (MOD-11 checksum)", () => {
    expect(isValidTaxId("0275566001619")).toBe(true);
    expect(checkTaxId("0-2755-66001-61-9").ok).toBe(true);
  });

  it("rejects a bad checksum", () => {
    const bad = checkTaxId("0275566001618");
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain("checksum");
  });

  it("rejects wrong length", () => {
    const short = checkTaxId("1234");
    expect(short.ok).toBe(false);
    expect(short.reason).toContain("13");
  });
});
