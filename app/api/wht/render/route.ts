import { NextResponse, type NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import {
  WHT_FORM_TYPES,
  clampSigOffset,
  validateWhtForm,
  type WhtFormType,
  type WhtFormValues,
} from "@/lib/wht/fields";
import { buildWhtHtml } from "@/lib/wht/template";
import { whtHtmlToPdf } from "@/lib/wht/render";

export const runtime = "nodejs";
export const maxDuration = 60;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

function optDataUri(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v.length > 6_000_000) return null;
  if (
    !v.startsWith("data:image/png;base64,") &&
    !v.startsWith("data:image/jpeg;base64,") &&
    !v.startsWith("data:image/jpg;base64,")
  )
    return null;
  return v;
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const rawType = str(body.formType, 20);
  const formType: WhtFormType = (WHT_FORM_TYPES as string[]).includes(rawType)
    ? (rawType as WhtFormType)
    : "pnd3";

  const values: WhtFormValues = {
    formType,
    certificateNo: str(body.certificateNo, 40),
    payerName: str(body.payerName),
    payerTaxId: str(body.payerTaxId, 30),
    payerAddress: str(body.payerAddress, 500),
    payeeName: str(body.payeeName),
    payeeTaxId: str(body.payeeTaxId, 30),
    payeeAddress: str(body.payeeAddress, 500),
    description: str(body.description, 200),
    issueDate: str(body.issueDate, 20),
    signDate: str(body.signDate, 20),
    amount: str(body.amount, 30),
    whtRate: str(body.whtRate, 10),
  };

  const errors = validateWhtForm(values);
  if (errors.length) {
    return NextResponse.json(
      { error: errors[0].message, field: errors[0].field },
      { status: 400 }
    );
  }

  try {
    const html = buildWhtHtml({
      values,
      signatureDataUri: optDataUri(body.signatureDataUri),
      stampDataUri: optDataUri(body.stampDataUri),
      hideSignature: body.hideSignature === true,
      hideStamp: body.hideStamp === true,
      signatureOffsetY: clampSigOffset(body.signatureOffsetY),
    });
    const bytes = await whtHtmlToPdf(html);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("wht render failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "render failed" },
      { status: 500 }
    );
  }
}
