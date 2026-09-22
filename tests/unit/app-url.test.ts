import { describe, expect, it } from "vitest";
import { resolveOrigin } from "@/lib/app-url";

describe("resolveOrigin", () => {
  it("prefers an explicit override", () => {
    expect(
      resolveOrigin({
        override: "https://app.example.com/",
        forwardedHost: "preview.vercel.app",
        host: "localhost:3000",
      })
    ).toBe("https://app.example.com");
  });

  it("uses the forwarded host + proto when no override", () => {
    expect(
      resolveOrigin({
        forwardedHost: "preview.vercel.app",
        forwardedProto: "https",
        host: "internal",
      })
    ).toBe("https://preview.vercel.app");
  });

  it("falls back to host with a default https proto", () => {
    expect(resolveOrigin({ host: "internal.taxworkaccount.com" })).toBe(
      "https://internal.taxworkaccount.com"
    );
  });

  it("uses BETTER_AUTH_URL fallback when no host", () => {
    expect(resolveOrigin({ fallback: "http://localhost:3000/" })).toBe(
      "http://localhost:3000"
    );
  });

  it("uses the production default as last resort", () => {
    expect(resolveOrigin({})).toBe("https://internal.taxworkaccount.com");
  });
});
