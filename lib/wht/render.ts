import "server-only";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import { WHT_PAGE_H, WHT_PAGE_W } from "./fields";

let browserPromise: Promise<Browser> | null = null;

async function executablePath(): Promise<string> {
  if (process.env.CHROMIUM_EXECUTABLE_PATH)
    return process.env.CHROMIUM_EXECUTABLE_PATH;
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

/**
 * Render the 1512x2138 PND sheet to PDF. Uses the screenshot-then-compose
 * approach (same as invoice-system): rasterize the sheet, then print the
 * raster at exact page size so the background form never shifts.
 */
export async function whtHtmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({
    width: WHT_PAGE_W,
    height: WHT_PAGE_H,
    deviceScaleFactor: 2,
  });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
    });
    const sheet = await page.$(".sheet");
    if (!sheet) throw new Error("WHT sheet not found");
    const png = await sheet.screenshot({ type: "png" });
    const imageHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:${WHT_PAGE_W}px ${WHT_PAGE_H}px;margin:0;}body{margin:0;}img{width:${WHT_PAGE_W}px;height:${WHT_PAGE_H}px;display:block;}</style></head><body><img src="data:image/png;base64,${(png as Buffer).toString("base64")}"></body></html>`;
    await page.setContent(imageHtml, { waitUntil: "load" });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Uint8Array(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}
