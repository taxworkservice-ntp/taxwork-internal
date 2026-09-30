import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  WHT_CHECKMARK_POS,
  WHT_PAGE_H,
  WHT_PAGE_W,
  WHT_SIGNATURE_BOX,
  WHT_STAMP_BOX,
  buildWhtOverlay,
  type WhtFormValues,
} from "./fields";

export type WhtRenderInput = {
  values: WhtFormValues;
  signatureDataUri: string | null;
  stampDataUri: string | null;
  hideSignature: boolean;
  hideStamp: boolean;
};

const FONT_STACK = "'Cordia New','Sarabun','Noto Sans Thai',sans-serif";

let bgCache: string | null = null;
let fontCssCache: string | null = null;

function readBgBase64(): string {
  if (bgCache !== null) return bgCache;
  try {
    const buf = fs.readFileSync(
      path.join(process.cwd(), "public", "wht", "form_page_final.png")
    );
    bgCache = buf.toString("base64");
  } catch {
    bgCache = "";
  }
  return bgCache;
}

function readFontBase64(file: string): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "fonts", file));
    return buf.toString("base64");
  } catch {
    return null;
  }
}

function fontCss(): string {
  if (fontCssCache !== null) return fontCssCache;
  // Cordia New first — the PND field geometry is tuned for its metrics
  // (same as invoice-system). Sarabun stays as fallback.
  const cordia = readFontBase64("cordia-new-regular.ttf");
  const cordiaBold = readFontBase64("cordia-new-bold.ttf");
  const regular = readFontBase64("Sarabun-Regular.ttf");
  const bold = readFontBase64("Sarabun-Bold.ttf");
  const faces: string[] = [];
  if (cordia)
    faces.push(
      `@font-face{font-family:'Cordia New';font-style:normal;font-weight:400;src:url(data:font/ttf;base64,${cordia}) format('truetype');}`
    );
  if (cordiaBold)
    faces.push(
      `@font-face{font-family:'Cordia New';font-style:normal;font-weight:700;src:url(data:font/ttf;base64,${cordiaBold}) format('truetype');}`
    );
  if (regular)
    faces.push(
      `@font-face{font-family:'Sarabun';font-style:normal;font-weight:400;src:url(data:font/ttf;base64,${regular}) format('truetype');}`
    );
  if (bold)
    faces.push(
      `@font-face{font-family:'Sarabun';font-style:normal;font-weight:700;src:url(data:font/ttf;base64,${bold}) format('truetype');}`
    );
  fontCssCache = faces.join("\n");
  return fontCssCache;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MAX_DATA_URI_LEN = 6_000_000;

function isSafeDataUri(uri: string | null): uri is string {
  if (!uri || uri.length > MAX_DATA_URI_LEN) return false;
  if (
    !uri.startsWith("data:image/png;base64,") &&
    !uri.startsWith("data:image/jpeg;base64,") &&
    !uri.startsWith("data:image/jpg;base64,")
  )
    return false;
  return /^[A-Za-z0-9+/=,;:]+$/.test(uri);
}

export function buildWhtHtml(input: WhtRenderInput): string {
  const { values } = input;
  const fields = buildWhtOverlay(values);
  const check = WHT_CHECKMARK_POS[values.formType];
  const bg = readBgBase64();

  const fieldDivs = fields
    .map((f) => {
      const style = [
        `position:absolute`,
        `top:${f.top}px`,
        `left:${f.left}px`,
        `font-size:${f.fontSize}px`,
        `font-weight:${f.bold ? 700 : 400}`,
        `line-height:1.35`,
        `white-space:${f.wrap ? "normal" : "pre"}`,
        `word-break:${f.wrap ? "break-word" : "normal"}`,
        `color:#000`,
        f.width ? `width:${f.width}px` : "",
        f.rightAlign ? `text-align:right` : "",
      ]
        .filter(Boolean)
        .join(";");
      return `<div style="${style}">${escapeHtml(f.value)}</div>`;
    })
    .join("");

  const showSig =
    !input.hideSignature && isSafeDataUri(input.signatureDataUri);
  const showStamp =
    !input.hideStamp && isSafeDataUri(input.stampDataUri);

  const sigDiv = showSig
    ? `<div style="position:absolute;top:${WHT_SIGNATURE_BOX.top}px;left:${WHT_SIGNATURE_BOX.left}px;width:${WHT_SIGNATURE_BOX.width}px;height:${WHT_SIGNATURE_BOX.height}px;"><img src="${input.signatureDataUri}" style="width:100%;height:100%;object-fit:contain;object-position:center center;" /></div>`
    : "";
  const stampDiv = showStamp
    ? `<div style="position:absolute;top:${WHT_STAMP_BOX.top}px;left:${WHT_STAMP_BOX.left}px;width:${WHT_STAMP_BOX.width}px;height:${WHT_STAMP_BOX.height}px;"><img src="${input.stampDataUri}" style="width:100%;height:100%;object-fit:contain;object-position:center center;" /></div>`
    : "";

  const checkTop = check.top - check.fs + 3;
  const checkSvg = `<svg style="position:absolute;top:${checkTop}px;left:${check.left}px;width:${check.fs}px;height:${check.fs}px;" viewBox="0 0 32 32" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M 6 17 C 6 17, 10 23, 13 25 C 16 19, 22 12, 27 7" /></svg>`;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<style>
${fontCss()}
@page{size:${WHT_PAGE_W}px ${WHT_PAGE_H}px;margin:0;}
html,body{margin:0;padding:0;background:#fff;}
.sheet{position:relative;width:${WHT_PAGE_W}px;height:${WHT_PAGE_H}px;overflow:hidden;font-family:${FONT_STACK};}
.sheet img.bg{position:absolute;inset:0;width:${WHT_PAGE_W}px;height:${WHT_PAGE_H}px;}
</style>
</head>
<body>
<div class="sheet">
${bg ? `<img class="bg" src="data:image/png;base64,${bg}" />` : ""}
${sigDiv}
${stampDiv}
${checkSvg}
${fieldDivs}
</div>
</body>
</html>`;
}
