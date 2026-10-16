import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { signedUrl, R2_BUCKET } from "@/lib/r2";
import { generatePublicId } from "@/lib/ids";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import {
  loadIntakeByToken,
  intakeStatus,
  intakePathPrefix,
  safeFileName,
  INTAKE_ALLOWED_MIME,
  INTAKE_MAX_FILE_BYTES,
} from "@/lib/intake";

export const runtime = "nodejs";

const KINDS = new Set(["company_house", "shareholder_id", "shareholder_house", "signature"]);

/**
 * Token-gated presigned upload for the public onboarding form. Files go straight
 * to R2 (bypassing the serverless body-size limit); the returned path is later
 * validated on submit to ensure it lives under this link's folder.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const rl = rateLimit(clientKey(request.headers, "onboard-upload"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "อัปโหลดบ่อยเกินไป" }, { status: 429 });

  const found = await loadIntakeByToken(token);
  if (!found || intakeStatus(found.link) !== "open") {
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const kind = String(body.kind ?? "");
  const fileName = String(body.fileName ?? "");
  const contentType = String(body.contentType ?? "");
  const size = Number(body.size ?? 0);

  if (!KINDS.has(kind)) return NextResponse.json({ error: "ไม่รู้จักชนิดไฟล์" }, { status: 400 });
  if (!INTAKE_ALLOWED_MIME.includes(contentType)) {
    return NextResponse.json({ error: "ชนิดไฟล์ไม่รองรับ (JPG/PNG/WebP/PDF)" }, { status: 400 });
  }
  if (!(size > 0) || size > INTAKE_MAX_FILE_BYTES) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกินไป (สูงสุด 10 MB)" }, { status: 400 });
  }

  const key = `${intakePathPrefix(found.link.id)}${kind}-${generatePublicId(8)}-${safeFileName(
    fileName
  )}`;
  const url = await signedUrl(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType })
  );
  return NextResponse.json({ url, path: key });
}
