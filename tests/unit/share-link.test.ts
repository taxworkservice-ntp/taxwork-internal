import { describe, expect, it } from "vitest";
import { shareSlug, shareTokenFromSegment, shareUrl } from "@/lib/share-link";

const TOKEN = "ABCDEFGHJKMNPQRSTVWX"; // 20 chars, Crockford base32

describe("shareSlug", () => {
  it("uses a short English month + Gregorian year", () => {
    expect(shareSlug("2026-08", 1)).toBe("tax-report-aug-2026");
  });

  it("appends the round only after the first", () => {
    expect(shareSlug("2026-08", 2)).toBe("tax-report-aug-2026-round-2");
    expect(shareSlug("2026-08", 1)).not.toContain("round");
  });

  it("handles a bad period label", () => {
    expect(shareSlug("", 1)).toBe("tax-report");
  });

  it("is ASCII-only and length-capped", () => {
    const slug = shareSlug("2026-08", 99);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.length).toBeLessThanOrEqual(48);
  });
});

describe("shareUrl", () => {
  it("builds a single-segment slug+token URL with no percent-encoding", () => {
    const url = shareUrl("https://x.co", "tax-report-aug-2026", TOKEN);
    expect(url).toBe(`https://x.co/r/tax-report-aug-2026-${TOKEN}`);
  });

  it("falls back to the token-only URL when the slug is empty", () => {
    expect(shareUrl("https://x.co", "", TOKEN)).toBe(`https://x.co/r/${TOKEN}`);
  });
});

describe("shareTokenFromSegment", () => {
  it("extracts a 20-char token from a slug-prefixed segment", () => {
    expect(shareTokenFromSegment(`tax-report-aug-2026-${TOKEN}`)).toBe(TOKEN);
    expect(shareTokenFromSegment(`tax-report-aug-2026-round-2-${TOKEN}`)).toBe(
      TOKEN
    );
  });

  it("returns the raw segment for a token-only link", () => {
    expect(shareTokenFromSegment(TOKEN)).toBe(TOKEN);
  });

  it("extracts the trailing 20-char token from legacy/dashed segments", () => {
    const legacy = "TW-6908-HW4DBRNA-FAPKESNB8T84VT47J469";
    expect(shareTokenFromSegment(legacy)).toBe("FAPKESNB8T84VT47J469");
  });
});

