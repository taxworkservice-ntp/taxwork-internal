import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chromium is a large native dependency; keep it external so it isn't
  // bundled by the bundler, and trace the Sarabun fonts into the render route
  // (they're read from disk and embedded as data URIs).
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    // Both routes run the headless-Chromium PDF pipeline.
    "/api/reports/render": [
      "./public/fonts/**",
      // The Chromium binary payload is read from disk at runtime, so file
      // tracing can't discover it. Include it explicitly or the serverless
      // bundle ships without node_modules/@sparticuz/chromium/bin.
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/reports/email": [
      "./public/fonts/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/r/[token]/email": [
      "./public/fonts/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default nextConfig;
