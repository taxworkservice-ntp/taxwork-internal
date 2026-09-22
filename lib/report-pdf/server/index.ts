import "server-only";
import { buildReportModel } from "@/lib/report-model";
import { renderReportHtml } from "./template";
import { appendDocuments, htmlToPdf } from "./render";

export type BuildServerReportOptions = {
  /** Cover + payment only (fast previews, no attached documents). */
  preview?: boolean;
};

/**
 * Full server-side pipeline: build the model from the DB/R2, render the cover
 * and payment page with headless Chromium, then append Part 2 documents.
 */
export async function buildServerReportPdf(
  reportId: string,
  opts: BuildServerReportOptions = {}
): Promise<Uint8Array> {
  const model = await buildReportModel(reportId);
  const html = renderReportHtml(model, { preview: opts.preview });
  const base = await htmlToPdf(html);
  if (opts.preview) return base;
  return appendDocuments(base, model.documents);
}
