import { describe, expect, it } from "vitest";
import { shareSlug, shareTokenFromSegment, shareUrl } from "@/lib/share-link";

describe("shareSlug", () => {
  it("uses the short Thai month + พ.ศ. year", () => {
    expect(shareSlug("2026-08", 1)).toBe("รายงานภาษี-ส.ค.2569");
  });

  it("appends the round only after the first", () => {
    expect(shareSlug("2026-08", 2)).toBe("รายงานภาษี-ส.ค.2569-ครั้งที่2");
    expect(shareSlug("2026-08", 1)).not.toContain("ครั้งที่");
  });

  it("handles a bad period label", () => {
    expect(shareSlug("", 1)).toBe("รายงานภาษี");
  });

  it("is URL-safe and length-capped", () => {
    const slug = shareSlug("2026-08", 99);
    expect(slug).not.toMatch(/[/\\?#%]/);
    expect(slug.length).toBeLessThanOrEqual(48);
  });
});

describe("shareUrl", () => {
  it("builds a single-segment slug+token URL", () => {
    const url = shareUrl("https://x.co", "รายงานภาษี-ส.ค.2569", "ABC123");
    expect(url).toContain("/r/");
    expect(decodeURIComponent(url.split("/r/")[1])).toBe(
      "รายงานภาษี-ส.ค.2569-ABC123"
    );
  });

  it("falls back to the token-only URL when the slug is empty", () => {
    expect(shareUrl("https://x.co", "", "ABC123")).toBe("https://x.co/r/ABC123");
  });
});

describe("shareTokenFromSegment", () => {
  it("extracts the token from a slug-prefixed segment", () => {
    expect(shareTokenFromSegment("รายงานภาษี-ส.ค.2569-ABC123")).toBe("ABC123");
    expect(shareTokenFromSegment("รายงานภาษี-ส.ค.2569-ครั้งที่2-ABC123")).toBe(
      "ABC123"
    );
  });

  it("returns the raw segment for a token-only link", () => {
    expect(shareTokenFromSegment("ABC123")).toBe("ABC123");
  });
});

