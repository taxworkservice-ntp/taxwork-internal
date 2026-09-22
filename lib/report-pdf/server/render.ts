import "server-only";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportModelDocument } from "@/lib/report-model";

/**
 * Headless Chromium HTML -> PDF. Runs server-side so Thai text is shaped by a
 * real browser engine and the output contains selectable text (not images).
 *
 * On Vercel/Lambda the bundled @sparticuz/chromium binary is used. Locally,
 * point CHROMIUM_EXECUTABLE_PATH at a Chrome/Chromium binary.
 */

let browserPromise: Promise<Browser> | null = null;

async function executablePath(): Promise<string> {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH;
  return chromium.executablePath();
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const localPath = process.env.CHROMIUM_EXECUTABLE_PATH;
    const args = localPath
      ? ["--no-sandbox", "--font-render-hinting=none"]
      : [...chromium.args, "--font-render-hinting=none"];
    browserPromise = puppeteer
      .launch({
        args,
        executablePath: await executablePath(),
        headless: true,
      })
      .catch((err) => {
        // Allow a later retry if the first launch fails (cold start, etc.).
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return pdf;
  } finally {
    await page.close().catch(() => undefined);
  }
}

function dataUriToBytes(uri: string): Uint8Array | null {
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const meta = uri.slice(0, comma);
  if (!meta.includes(";base64")) return null;
  try {
    return new Uint8Array(Buffer.from(uri.slice(comma + 1), "base64"));
  } catch {
    return null;
  }
}

function isPng(b: Uint8Array): boolean {
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}
function isJpeg(b: Uint8Array): boolean {
  return b[0] === 0xff && b[1] === 0xd8;
}
function isPdf(b: Uint8Array): boolean {
  return (
    (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) ||
    (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf && b[3] === 0x25)
  );
}

/** Append Part 2 documents after the rendered pages (PDF copy or image fit). */
export async function appendDocuments(
  base: Uint8Array,
  docs: ReportModelDocument[]
): Promise<Uint8Array> {
  if (!docs.length) return base;
  const out = await PDFDocument.load(base);
  const first = out.getPages()[0];
  const pageW = first?.getWidth() ?? 595.28;
  const pageH = first?.getHeight() ?? 841.89;
  const margin = 48;

  for (const d of docs) {
    const bytes = dataUriToBytes(d.dataUri);
    if (!bytes) continue;
    try {
      if (isPdf(bytes)) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await out.copyPages(src, src.getPageIndices());
        for (const p of copied) out.addPage(p);
      } else if (isPng(bytes) || isJpeg(bytes)) {
        const img = isPng(bytes)
          ? await out.embedPng(bytes)
          : await out.embedJpg(bytes);
        const page = out.addPage([pageW, pageH]);
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        let w = maxW;
        let h = (img.height / img.width) * w;
        if (h > maxH) {
          h = maxH;
          w = (img.width / img.height) * h;
        }
        page.drawImage(img, {
          x: (pageW - w) / 2,
          y: (pageH - h) / 2,
          width: w,
          height: h,
        });
      }
      // Unsupported types are skipped.
    } catch {
      // Skip unreadable documents rather than failing the whole report.
    }
  }
  return out.save();
}

/**
 * Stamp "X / Y" page numbers at the bottom center of every page. Uses a
 * standard Latin font because Thai combining marks are not shaped by pdf-lib's
 * drawText.
 */
export async function stampPageNumbers(pdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  if (pages.length < 2) return pdf;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 9;
  pages.forEach((page, i) => {
    const label = `${i + 1} / ${pages.length}`;
    const w = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: page.getWidth() / 2 - w / 2,
      y: 22,
      size,
      font,
      color: rgb(0.45, 0.45, 0.5),
    });
  });
  return doc.save();
}
