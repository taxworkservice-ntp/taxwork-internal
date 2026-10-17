import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/resend";
import { buildIntakeNotifyEmail } from "@/lib/email/intake-email";
import { appOrigin } from "@/lib/app-url";
import {
  loadIntakeByToken,
  intakeStatus,
  isValidIntakePath,
  INTAKE_CONSENT_VERSION,
  INTAKE_MIN_SHAREHOLDERS,
  INTAKE_MAX_SHAREHOLDERS,
  type IntakeShareholder,
} from "@/lib/intake";

export const runtime = "nodejs";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}
function nullable(v: unknown, max = 200): string | null {
  const s = clean(v, max);
  return s || null;
}
function numOrNull(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function dateOrNull(v: unknown): string | null {
  const s = clean(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function json(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Public, token-gated intake submission — kept minimal for the prospect. Address
 * and tax details are captured/transcribed by staff at review, so they are NOT
 * accepted here and are never overwritten on re-submit.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const rl = rateLimit(clientKey(request.headers, "onboard-submit"), 10, 60_000);
  if (!rl.ok) return json("ส่งบ่อยเกินไป กรุณาลองใหม่", 429);

  const found = await loadIntakeByToken(token);
  if (!found || intakeStatus(found.link) !== "open") return json("ลิงก์ไม่ถูกต้องหรือหมดอายุ", 403);
  // One-shot: the prospect cannot edit after sending. Any existing submission
  // locks the link for them (staff can still transcribe via review actions).
  if (found.submission) return json("คำขอของท่านถูกส่งแล้ว กรุณาติดต่อเจ้าหน้าที่หากต้องแก้ไข", 409);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json("invalid body", 400);
  }

  // --- required core ---
  const nameTh = clean(body.name_th);
  const companyEmail = clean(body.company_email, 120);
  const companyPhone = clean(body.company_phone, 50);
  const companyHouse = clean(body.company_house_path, 400);
  const companyMap = clean(body.company_map_path, 400);
  const contactName = clean(body.contact_name);
  const contactPhone = clean(body.contact_phone, 50);
  const contactEmail = clean(body.contact_email, 120);
  const signerName = clean(body.signer_name);
  const signaturePath = clean(body.signature_path, 400);
  const signedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  if (!nameTh) return json("กรุณากรอกชื่อบริษัท (ไทย)", 400);
  if (!isEmail(companyEmail)) return json("กรุณากรอกอีเมลบริษัทให้ถูกต้อง", 400);
  if (!companyPhone) return json("กรุณากรอกโทรศัพท์บริษัท", 400);
  if (!isValidIntakePath(companyHouse, found.link.id))
    return json("กรุณาแนบสำเนาทะเบียนบ้านของที่ตั้งบริษัท", 400);
  if (!isValidIntakePath(companyMap, found.link.id))
    return json("กรุณาแนบภาพแผนที่แสดงที่ตั้งบริษัท", 400);
  if (!contactName || !contactPhone || !isEmail(contactEmail))
    return json("กรุณากรอกข้อมูลผู้ติดต่อให้ครบถ้วน", 400);
  if (!signerName) return json("กรุณากรอกชื่อ–นามสกุลผู้ลงนาม", 400);
  if (!isValidIntakePath(signaturePath, found.link.id)) return json("กรุณาลงนามยืนยันข้อมูล", 400);
  if (body.consent !== true) return json("กรุณายินยอมให้เก็บและใช้ข้อมูล", 400);

  // --- shareholders (>= 2, percents must total 100) ---
  const rawSh = Array.isArray(body.shareholders) ? body.shareholders : [];
  if (rawSh.length < INTAKE_MIN_SHAREHOLDERS || rawSh.length > INTAKE_MAX_SHAREHOLDERS)
    return json(`กรุณากรอกข้อมูลผู้ถือหุ้นอย่างน้อย ${INTAKE_MIN_SHAREHOLDERS} ราย`, 400);

  function parsePercent(v: unknown): number | null {
    const s = String(v ?? "").trim().replace(/%/g, "");
    if (!s) return null;
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN as unknown as null;
  }

  const shareholders: IntakeShareholder[] = [];
  let percentSum = 0;
  for (const raw of rawSh) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const name = clean(s.name);
    const phone = clean(s.phone, 50);
    const email = clean(s.email, 120);
    const idCardPath = clean(s.idCardPath, 400);
    const houseRegPath = clean(s.houseRegPath, 400);
    const pct = parsePercent(s.percent);
    if (!name || !phone || !isEmail(email))
      return json("ข้อมูลผู้ถือหุ้นไม่ครบ (ชื่อ/โทร/อีเมล)", 400);
    if (pct == null || Number.isNaN(pct))
      return json(`กรุณาระบุสัดส่วนหุ้นของ "${name}" เป็นตัวเลข 0–100`, 400);
    if (!isValidIntakePath(idCardPath, found.link.id))
      return json(`ผู้ถือหุ้น "${name}" ยังแนบบัตรประชาชนไม่ครบ`, 400);
    percentSum += pct;
    shareholders.push({
      name,
      idNo: clean(s.idNo, 20).replace(/\D/g, ""),
      percent: String(pct),
      isDirector: s.isDirector === true,
      phone,
      email,
      idCardPath,
      houseRegPath: isValidIntakePath(houseRegPath, found.link.id) ? houseRegPath : "",
    });
  }
  if (Math.abs(percentSum - 100) > 0.01)
    return json(`สัดส่วนหุ้นรวมต้องเท่ากับ 100% (ปัจจุบัน ${percentSum.toFixed(2).replace(/\.?0+$/, "")}%)`, 400);

  const v = {
    name_th: nameTh,
    name_en: nullable(body.name_en),
    name_th2: nullable(body.name_th2),
    name_en2: nullable(body.name_en2),
    juristic_id: "",
    reg_date: dateOrNull(body.reg_date),
    capital_registered: numOrNull(body.capital_registered),
    capital_paid: numOrNull(body.capital_paid),
    business_desc: nullable(body.business_desc, 1000),
    company_email: companyEmail,
    company_phone: companyPhone,
    company_house_path: companyHouse,
    company_map_path: companyMap,
    company_map_desc: nullable(body.company_map_desc, 500),
    contact_name: contactName,
    contact_position: nullable(body.contact_position, 100),
    contact_phone: contactPhone,
    contact_email: contactEmail,
    shareholders: JSON.stringify(shareholders),
    signer_name: signerName,
    signature_path: signaturePath,
    signed_at: new Date().toISOString(),
    signed_ip: signedIp,
    consent_at: new Date().toISOString(),
    consent_version: INTAKE_CONSENT_VERSION,
    notes: nullable(body.notes, 1000),
    raw: JSON.stringify(body).slice(0, 20000),
  };

  // One-shot: no re-submit path (the early guard above already returned 409
  // when a submission exists).
  let id: string;
  try {
    const inserted = (await sql`
      insert into intake_submissions (
        link_id, name_th, name_en, juristic_id, reg_date,
        capital_registered, capital_paid, business_desc,
        company_email, company_phone, company_house_path, company_map_path, company_map_desc,
        contact_name, contact_position, contact_phone, contact_email,
        shareholders, signer_name, signature_path, signed_at, signed_ip,
        consent_at, consent_version, notes, raw
      ) values (
        ${found.link.id}, ${v.name_th}, ${v.name_en}, ${v.juristic_id}, ${v.reg_date},
        ${v.capital_registered}, ${v.capital_paid}, ${v.business_desc},
        ${v.company_email}, ${v.company_phone}, ${v.company_house_path}, ${v.company_map_path}, ${v.company_map_desc},
        ${v.contact_name}, ${v.contact_position}, ${v.contact_phone}, ${v.contact_email},
        ${v.shareholders}::jsonb, ${v.signer_name}, ${v.signature_path}, ${v.signed_at}, ${v.signed_ip},
        ${v.consent_at}, ${v.consent_version}, ${v.notes}, ${v.raw}::jsonb
      ) returning id
    `) as { id: string }[];
    id = inserted[0].id;
  } catch (error) {
    console.error("intake submit failed:", error);
    return json("บันทึกไม่สำเร็จ กรุณาลองใหม่", 500);
  }

  // Best-effort staff notification.
  try {
    const to = (process.env.USER_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (to.length && process.env.REPORT_FROM_EMAIL) {
      const origin = await appOrigin();
      const built = buildIntakeNotifyEmail({
        name: v.name_th,
        juristicId: "— (รอจดทะเบียน)",
        contactName: v.contact_name,
        contactPhone: v.contact_phone,
        contactEmail: v.contact_email,
        reviewUrl: `${origin}/onboarding`,
      });
      await sendEmail({ to: to.join(","), subject: built.subject, html: built.html, text: built.text });
    }
  } catch (error) {
    console.error("intake notify failed:", error);
  }

  return NextResponse.json({
    ok: true,
    ref: `INT-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    id,
    submittedAt: v.signed_at,
  });
}
