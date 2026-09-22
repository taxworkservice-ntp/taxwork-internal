import { NextResponse, type NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { buildServerReportPdf } from "@/lib/report-pdf/server";

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

  try {
    const pdf = await buildServerReportPdf(reportId, {
      preview: body.preview === true,
    });
    return new NextResponse(new Uint8Array(pdf), {
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
