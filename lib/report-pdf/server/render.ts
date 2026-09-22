import "server-only";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Headless Chromium HTML -> PDF, plus PDF composition (cover, slip pages,
 * payment page, documents) and page-number stamping.
 *
 * On Vercel/Lambda the bundled @sparticuz/chromium binary is used. Locally,
 * point CHROMIUM_EXECUTABLE_PATH at a Chrome/Chromium binary.
 */

const A4_W = 595.28;
const A4_H = 841.89;

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
      .launch({ args, executablePath: await executablePath(), headless: true })
      .catch((err) => {
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
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

export function dataUriToBytes(uri: string): Uint8Array | null {
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
export function isPdfBytes(b: Uint8Array): boolean {
  return (
    (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) ||
    (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf && b[3] === 0x25)
  );
}

/** Number of pages a document will occupy when appended (1 for images). */
export async function appendedPageCount(bytes: Uint8Array): Promise<number> {
  if (!isPdfBytes(bytes)) return 1;
  try {
    const d = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return d.getPageCount();
  } catch {
    return 1;
  }
}

/** Append one document (PDF copied page-for-page, image fit to an A4 page). */
async function addDocToPdf(out: PDFDocument, bytes: Uint8Array): Promise<void> {
  if (isPdfBytes(bytes)) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const p of copied) out.addPage(p);
    return;
  }
  if (isPng(bytes) || isJpeg(bytes)) {
    const img = isPng(bytes)
      ? await out.embedPng(bytes)
      : await out.embedJpg(bytes);
    const page = out.addPage([A4_W, A4_H]);
    const margin = 48;
    const maxW = A4_W - margin * 2;
    const maxH = A4_H - margin * 2;
    let w = maxW;
    let h = (img.height / img.width) * w;
    if (h > maxH) {
      h = maxH;
      w = (img.width / img.height) * h;
    }
    page.drawImage(img, {
      x: (A4_W - w) / 2,
      y: (A4_H - h) / 2,
      width: w,
      height: h,
    });
  }
}

export type SlipBytes = { id: string; bytes: Uint8Array };

export type ComposeInput = {
  coverPdf: Uint8Array;
  /** Slips in filing order. */
  slips: SlipBytes[];
  paymentPdf: Uint8Array | null;
  /** Part 2 documents in order. */
  documents: Uint8Array[];
};

/**
 * Compose the final PDF: cover → slip pages → payment page → documents.
 * Returns the 1-based page number where each slip starts.
 */
export async function composeReportPdf(
  input: ComposeInput
): Promise<{ bytes: Uint8Array; slipPages: { id: string; page: number }[] }> {
  const out = await PDFDocument.create();

  const cover = await PDFDocument.load(input.coverPdf, { ignoreEncryption: true });
  for (const p of await out.copyPages(cover, cover.getPageIndices())) out.addPage(p);

  const slipPages: { id: string; page: number }[] = [];
  for (const s of input.slips) {
    const page = out.getPageCount() + 1;
    await addDocToPdf(out, s.bytes);
    slipPages.push({ id: s.id, page });
  }

  if (input.paymentPdf) {
    const pay = await PDFDocument.load(input.paymentPdf, { ignoreEncryption: true });
    for (const p of await out.copyPages(pay, pay.getPageIndices())) out.addPage(p);
  }

  for (const d of input.documents) await addDocToPdf(out, d);

  return { bytes: await out.save(), slipPages };
}

/**
 * Stamp "X / Y" page numbers at the bottom center of every page. Uses a
 * standard Latin font because pdf-lib's drawText doesn't shape Thai combining
 * marks.
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
