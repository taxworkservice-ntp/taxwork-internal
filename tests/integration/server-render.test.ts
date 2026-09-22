// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { renderCoverHtml, renderReportHtml } from "@/lib/report-pdf/server/template";
import {
  composeReportPdf,
  dataUriToBytes,
  htmlToPdf,
} from "@/lib/report-pdf/server/render";
import { sampleModel } from "@/tests/fixtures/model";

const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAoVfP7wAAAAASUVORK5CYII=";

/**
 * Real headless-Chromium render. Skipped unless CHROMIUM_EXECUTABLE_PATH points
 * at a Chrome/Chromium binary (locally, or bundled in CI). This is the test
 * that proves the output is real, selectable Thai text — not images.
 */
const chromePath = process.env.CHROMIUM_EXECUTABLE_PATH;
const maybe = chromePath ? describe : describe.skip;

maybe("server report render (integration)", () => {
  it(
    "renders selectable Thai text across pages",
    async () => {
      const html = renderReportHtml(sampleModel());
      const pdfBytes = await htmlToPdf(html);

      // Real PDF header.
      expect(String.fromCharCode(...pdfBytes.slice(0, 5))).toBe("%PDF-");

      const doc = await PDFDocument.load(pdfBytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(2); // cover + payment

      const parser = new PDFParse({ data: pdfBytes });
      try {
        const result = await parser.getText();
        expect(result.total).toBeGreaterThanOrEqual(2);
        // PDF text extraction decomposes Thai SARA AM (ำ) and may alter
        // spacing, so assert on needles without combining marks and compare
        // with whitespace stripped.
        const flat = result.text.replace(/\s+/g, "");
        expect(flat).toContain("รายงานสรุป");
        expect(flat).toContain("ภ.พ.30");
        expect(flat).toContain("5,000.00");
        expect(flat).toContain("สแกนด้วยแอปธนาคาร");
        expect(flat).toContain("164-3-84594-2");
      } finally {
        await parser.destroy();
      }
    },
    120_000
  );

  it("composes cover then slip (slip lands right after the cover)", async () => {
    const model = sampleModel();
    const coverPdf = await htmlToPdf(renderCoverHtml(model));
    const coverPages = (await PDFDocument.load(coverPdf)).getPageCount();
    const slipBytes = dataUriToBytes(PNG_1x1);
    expect(slipBytes).not.toBeNull();

    const { bytes, slipPages } = await composeReportPdf({
      coverPdf,
      slips: [{ id: "s1", bytes: slipBytes! }],
      paymentPdf: null,
      documents: [],
    });

    expect(slipPages).toEqual([{ id: "s1", page: coverPages + 1 }]);
    const outDoc = await PDFDocument.load(bytes);
    expect(outDoc.getPageCount()).toBe(coverPages + 1);
  }, 120_000);
});
