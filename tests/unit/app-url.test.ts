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
        forwardedHost: "preview.example.com",
        forwardedProto: "https",
        host: "internal",
      })
    ).toBe("https://preview.example.com");
  });

  it("skips Vercel deployment hosts (always login-protected)", () => {
    expect(
      resolveOrigin({
        forwardedHost: "taxwork-internal-abc123.vercel.app",
        forwardedProto: "https",
        fallback: "https://internal.taxworkaccount.com",
      })
    ).toBe("https://internal.taxworkaccount.com");
  });

  it("skips a bare *.vercel.app host and uses the default", () => {
    expect(resolveOrigin({ host: "my-app.vercel.app" })).toBe(
      "https://internal.taxworkaccount.com"
    );
  });

  it("override wins even when the request host is a vercel.app", () => {
    expect(
      resolveOrigin({
        override: "https://internal.taxworkaccount.com",
        host: "my-app.vercel.app",
      })
    ).toBe("https://internal.taxworkaccount.com");
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
