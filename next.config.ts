import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chromium is a large native dependency; keep it external so it isn't
  // bundled by the bundler, and trace the Sarabun fonts into the render route
  // (they're read from disk and embedded as data URIs).
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/reports/render": ["./public/fonts/**"],
  },
};

export default nextConfig;
