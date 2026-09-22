import { NextResponse, type NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { buildServerReportPdf } from "@/lib/report-pdf/server";
import { setAttachmentPages } from "@/lib/actions/reports";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server-side report PDF generation (headless Chromium → real text).
 * Gated behind the `report_renderer` setting on the client; the legacy
 * browser renderer remains available and untouched.
 */
export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { reportId?: unknown; preview?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  if (!reportId) {
    return NextResponse.json({ error: "reportId required" }, { status: 400 });
  }

  const preview = body.preview === true;
  try {
    const { bytes, slipPages } = await buildServerReportPdf(reportId, { preview });
    if (!preview && slipPages.length) {
      try {
        await setAttachmentPages(slipPages);
      } catch (error) {
        // Non-fatal: the PDF is generated even if we can't record page numbers.
        console.error("persisting slip page numbers failed:", error);
      }
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("server report render failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "render failed" },
      { status: 500 }
    );
  }
}
