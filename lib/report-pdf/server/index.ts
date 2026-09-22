import "server-only";
import { PDFDocument } from "pdf-lib";
import { buildReportModel, readObjectBytes } from "@/lib/report-model";
import { renderCoverHtml, renderPaymentHtml } from "./template";
import {
  appendedPageCount,
  composeReportPdf,
  dataUriToBytes,
  htmlToPdf,
  stampPageNumbers,
} from "./render";

export type BuildServerReportOptions = {
  /** Cover only (fast previews, no slips/payment/documents). */
  preview?: boolean;
};

export type ServerReportResult = {
  bytes: Uint8Array;
  /** 1-based page each slip starts on (persisted for the share link). */
  slipPages: { id: string; page: number }[];
};

/**
 * Full server-side pipeline: build the model, render the cover and payment
 * page with headless Chromium, insert pay-in slip pages right after the cover,
 * append Part 2 documents, and stamp page numbers.
 */
export async function buildServerReportPdf(
  reportId: string,
  opts: BuildServerReportOptions = {}
): Promise<ServerReportResult> {
  const model = await buildReportModel(reportId);
  const coverPdf = await htmlToPdf(renderCoverHtml(model));

  if (opts.preview) {
    return { bytes: await stampPageNumbers(coverPdf), slipPages: [] };
  }

  // Pay-in slips, in filing order.
  const slipMeta = model.filings.flatMap((f) => f.slips);
  const slips: { id: string; bytes: Uint8Array }[] = [];
  for (const s of slipMeta) {
    const bytes = await readObjectBytes(s.storagePath);
    if (bytes) slips.push({ id: s.id, bytes });
  }

  // Compute slip page numbers (cover pages + preceding slips) so the payment
  // page can reference them before we compose.
  const coverDoc = await PDFDocument.load(coverPdf, { ignoreEncryption: true });
  const slipPagesMap = new Map<string, number>();
  let cursor = coverDoc.getPageCount();
  for (const s of slips) {
    cursor += 1;
    slipPagesMap.set(s.id, cursor);
    cursor += (await appendedPageCount(s.bytes)) - 1;
  }

  const paymentHtml = renderPaymentHtml(model, slipPagesMap);
  const paymentPdf = paymentHtml ? await htmlToPdf(paymentHtml) : null;

  const documents: Uint8Array[] = [];
  for (const d of model.documents) {
    const bytes = dataUriToBytes(d.dataUri);
    if (bytes) documents.push(bytes);
  }

  const composed = await composeReportPdf({
    coverPdf,
    slips,
    paymentPdf,
    documents,
  });

  return {
    bytes: await stampPageNumbers(composed.bytes),
    slipPages: composed.slipPages,
  };
}
