import "server-only";
import { buildReportModel, readObjectBytes } from "@/lib/report-model";
import { renderCoverHtml } from "./template";
import {
  composeReportPdf,
  dataUriToBytes,
  htmlToPdf,
  stampPageNumbers,
} from "./render";

export type BuildServerReportOptions = {
  /** Cover only (fast previews, no slips/documents). */
  preview?: boolean;
};

export type ServerReportResult = {
  bytes: Uint8Array;
  /** 1-based page each slip starts on (persisted for the share link). */
  slipPages: { id: string; page: number }[];
};

/**
 * Full server-side pipeline: build the model, render the cover with headless
 * Chromium, insert pay-in slip pages right after the cover, append Part 2
 * documents, and stamp page numbers. Payment details live on the cover cards,
 * so there is no separate payment page.
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

  const documents: Uint8Array[] = [];
  for (const d of model.documents) {
    const bytes = dataUriToBytes(d.dataUri);
    if (bytes) documents.push(bytes);
  }

  const composed = await composeReportPdf({
    coverPdf,
    slips,
    paymentPdf: null,
    documents,
  });

  return {
    bytes: await stampPageNumbers(composed.bytes),
    slipPages: composed.slipPages,
  };
}
