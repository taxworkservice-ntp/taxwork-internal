import { beforeAll, describe, expect, it } from "vitest";
import {
  isValidTaxId,
  normalizeTaxId,
  shareAccessCookieName,
  shareAccessCookieOptions,
  signShareAccess,
  verifyShareAccess,
} from "@/lib/share-access";

const TOKEN_KEY = "ABCDEFGHJKMNPQRSTVWX";

beforeAll(() => {
  process.env.SHARE_ACCESS_SECRET = "test-secret";
});

describe("normalizeTaxId", () => {
  it("keeps digits and strips separators", () => {
    expect(normalizeTaxId("0-1055-54000-12-3")).toBe("0105554000123");
    expect(normalizeTaxId(" 123 456 ")).toBe("123456");
  });

  it("handles empty / nullish input", () => {
    expect(normalizeTaxId("")).toBe("");
    expect(normalizeTaxId(null)).toBe("");
    expect(normalizeTaxId(undefined)).toBe("");
  });
});

describe("isValidTaxId", () => {
  it("accepts exactly 13 digits", () => {
    expect(isValidTaxId("0105554000123")).toBe(true);
    expect(isValidTaxId("0-1055-54000-12-3")).toBe(true);
  });

  it("rejects other lengths", () => {
    expect(isValidTaxId("123")).toBe(false);
    expect(isValidTaxId("01055540001234")).toBe(false);
    expect(isValidTaxId(null)).toBe(false);
  });
});

describe("share access cookie", () => {
  it("names the cookie per share token", () => {
    expect(shareAccessCookieName(TOKEN_KEY)).toBe(`share_access_${TOKEN_KEY}`);
  });

  it("round-trips a signed value", () => {
    const value = signShareAccess(TOKEN_KEY);
    expect(verifyShareAccess(value, TOKEN_KEY)).toBe(true);
  });

  it("rejects a missing cookie", () => {
    expect(verifyShareAccess(undefined, TOKEN_KEY)).toBe(false);
    expect(verifyShareAccess(null, TOKEN_KEY)).toBe(false);
  });

  it("rejects a tampered value", () => {
    const value = signShareAccess(TOKEN_KEY);
    expect(verifyShareAccess(`${value}x`, TOKEN_KEY)).toBe(false);
    expect(verifyShareAccess(value.slice(0, -1), TOKEN_KEY)).toBe(false);
  });

  it("rejects a value signed for a different token", () => {
    expect(verifyShareAccess(signShareAccess("OTHERTOKENKEY1234567"), TOKEN_KEY)).toBe(
      false
    );
  });

  it("sets hardening attributes", () => {
    const opts = shareAccessCookieOptions(3600);
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/r",
      maxAge: 3600,
    });
  });
});
