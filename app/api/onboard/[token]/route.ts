import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { isValidTaxId, formatTaxId } from "@/lib/tax-id";
import { sendEmail } from "@/lib/email/resend";
import { buildIntakeNotifyEmail } from "@/lib/email/intake-email";
import { appOrigin } from "@/lib/app-url";
import {
  loadIntakeByToken,
  intakeStatus,
  isValidIntakePath,
  INTAKE_CONSENT_VERSION,
  type IntakeShareholder,
} from "@/lib/intake";

export const runtime = "nodejs";

const FILING_OPTIONS = ["ภ.พ.30", "ภ.ง.ด.1", "ภ.ง.ด.3", "ภ.ง.ด.53", "ภ.ง.ด.50/51", "ประกันสังคม"];

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}
function nullable(v: unknown, max = 200): string | null {
  const s = clean(v, max);
  return s || null;
}
function dateOrNull(v: unknown): string | null {
  const s = clean(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function numOrNull(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Public, token-gated intake submission. Validates the payload, upserts the
 * (single) submission for the link while it's still editable, and notifies staff.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const rl = rateLimit(clientKey(request.headers, "onboard-submit"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "ส่งบ่อยเกินไป กรุณาลองใหม่" }, { status: 429 });

  const found = await loadIntakeByToken(token);
  if (!found || intakeStatus(found.link) !== "open") {
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });
  }
  if (found.submission && found.submission.status !== "submitted") {
    return NextResponse.json({ error: "คำขอนี้ถูกตรวจสอบแล้ว" }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // --- validate ---
  const nameTh = clean(body.name_th);
  const juristicId = clean(body.juristic_id).replace(/\D/g, "");
  const addrLine = clean(body.addr_line);
  const subdistrict = clean(body.addr_subdistrict);
  const district = clean(body.addr_district);
  const province = clean(body.addr_province);
  const postcode = clean(body.addr_postcode, 10);
  const contactName = clean(body.contact_name);
  const contactPhone = clean(body.contact_phone, 50);
  const contactEmail = clean(body.contact_email, 120);
  const companyHouse = clean(body.company_house_path, 400);

  if (!nameTh) return json("กรุณากรอกชื่อบริษัท", 400);
  if (!isValidTaxId(juristicId)) return json("เลขทะเบียนนิติบุคคล 13 หลักไม่ถูกต้อง", 400);
  if (!addrLine || !subdistrict || !district || !province || !postcode)
    return json("กรุณากรอกที่อยู่จดทะเบียนให้ครบถ้วน", 400);
  if (!contactName || !contactPhone || !isEmail(contactEmail))
    return json("กรุณากรอกข้อมูลผู้ติดต่อให้ครบถ้วน", 400);
  if (!isValidIntakePath(companyHouse, found.link.id))
    return json("กรุณาแนบสำเนาทะเบียนบ้านของที่ตั้งบริษัท", 400);
  if (body.consent !== true) return json("กรุณายินยอมให้เก็บและใช้ข้อมูล", 400);

  const rawShareholders = Array.isArray(body.shareholders) ? body.shareholders : [];
  if (rawShareholders.length < 1 || rawShareholders.length > 20)
    return json("กรุณากรอกข้อมูลผู้ถือหุ้นอย่างน้อย 1 ราย", 400);

  const shareholders: IntakeShareholder[] = [];
  for (const raw of rawShareholders) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const name = clean(s.name);
    const phone = clean(s.phone, 50);
    const email = clean(s.email, 120);
    const idCardPath = clean(s.idCardPath, 400);
    const houseRegPath = clean(s.houseRegPath, 400);
    if (!name || !phone || !isEmail(email))
      return json("ข้อมูลผู้ถือหุ้นไม่ครบ (ชื่อ/โทร/อีเมล)", 400);
    if (!isValidIntakePath(idCardPath, found.link.id) || !isValidIntakePath(houseRegPath, found.link.id))
      return json(`ผู้ถือหุ้น "${name}" ยังแนบบัตรประชาชน/ทะเบียนบ้านไม่ครบ`, 400);
    shareholders.push({
      name,
      idNo: clean(s.idNo, 20).replace(/\D/g, ""),
      percent: clean(s.percent, 20),
      isDirector: s.isDirector === true,
      phone,
      email,
      idCardPath,
      houseRegPath,
    });
  }

  const filings = (Array.isArray(body.filings) ? body.filings : [])
    .map((f) => clean(f, 20))
    .filter((f) => FILING_OPTIONS.includes(f));

  const cols = {
    name_th: nameTh,
    name_en: nullable(body.name_en),
    name_th2: nullable(body.name_th2),
    name_en2: nullable(body.name_en2),
    juristic_id: juristicId,
    reg_date: dateOrNull(body.reg_date),
    capital_registered: numOrNull(body.capital_registered),
    capital_paid: numOrNull(body.capital_paid),
    business_desc: nullable(body.business_desc, 1000),
    addr_line: addrLine,
    addr_moo: nullable(body.addr_moo, 50),
    addr_soi: nullable(body.addr_soi, 100),
    addr_road: nullable(body.addr_road, 100),
    addr_subdistrict: subdistrict,
    addr_district: district,
    addr_province: province,
    addr_postcode: postcode,
    company_house_path: companyHouse,
    vat_registered: body.vat_registered === true,
    vat_reg_date: dateOrNull(body.vat_reg_date),
    vat_place: nullable(body.vat_place, 300),
    fiscal_year_end: nullable(body.fiscal_year_end, 50),
    filings,
    has_prev_accountant: typeof body.has_prev_accountant === "boolean" ? body.has_prev_accountant : null,
    prev_accountant: nullable(body.prev_accountant, 200),
    contact_name: contactName,
    contact_position: nullable(body.contact_position, 100),
    contact_phone: contactPhone,
    contact_email: contactEmail,
    shareholders: JSON.stringify(shareholders),
    consent_at: new Date().toISOString(),
    consent_version: INTAKE_CONSENT_VERSION,
    notes: nullable(body.notes, 1000),
    raw: JSON.stringify(body).slice(0, 20000),
  };

  try {
    if (found.submission) {
      await sql`update intake_submissions set
        name_th=${cols.name_th}, name_en=${cols.name_en}, name_th2=${cols.name_th2}, name_en2=${cols.name_en2},
        juristic_id=${cols.juristic_id}, reg_date=${cols.reg_date},
        capital_registered=${cols.capital_registered}, capital_paid=${cols.capital_paid},
        business_desc=${cols.business_desc},
        addr_line=${cols.addr_line}, addr_moo=${cols.addr_moo}, addr_soi=${cols.addr_soi}, addr_road=${cols.addr_road},
        addr_subdistrict=${cols.addr_subdistrict}, addr_district=${cols.addr_district},
        addr_province=${cols.addr_province}, addr_postcode=${cols.addr_postcode},
        company_house_path=${cols.company_house_path},
        vat_registered=${cols.vat_registered}, vat_reg_date=${cols.vat_reg_date}, vat_place=${cols.vat_place},
        fiscal_year_end=${cols.fiscal_year_end}, filings=${cols.filings},
        has_prev_accountant=${cols.has_prev_accountant}, prev_accountant=${cols.prev_accountant},
        contact_name=${cols.contact_name}, contact_position=${cols.contact_position},
        contact_phone=${cols.contact_phone}, contact_email=${cols.contact_email},
        shareholders=${cols.shareholders}::jsonb, consent_at=${cols.consent_at}, consent_version=${cols.consent_version},
        notes=${cols.notes}, raw=${cols.raw}::jsonb, status='submitted'
        where id=${found.submission.id}`;
    } else {
      await sql`insert into intake_submissions (
        link_id, name_th, name_en, name_th2, name_en2, juristic_id, reg_date,
        capital_registered, capital_paid, business_desc,
        addr_line, addr_moo, addr_soi, addr_road, addr_subdistrict, addr_district, addr_province, addr_postcode,
        company_house_path, vat_registered, vat_reg_date, vat_place, fiscal_year_end, filings,
        has_prev_accountant, prev_accountant, contact_name, contact_position, contact_phone, contact_email,
        shareholders, consent_at, consent_version, notes, raw
      ) values (
        ${found.link.id}, ${cols.name_th}, ${cols.name_en}, ${cols.name_th2}, ${cols.name_en2}, ${cols.juristic_id}, ${cols.reg_date},
        ${cols.capital_registered}, ${cols.capital_paid}, ${cols.business_desc},
        ${cols.addr_line}, ${cols.addr_moo}, ${cols.addr_soi}, ${cols.addr_road}, ${cols.addr_subdistrict}, ${cols.addr_district}, ${cols.addr_province}, ${cols.addr_postcode},
        ${cols.company_house_path}, ${cols.vat_registered}, ${cols.vat_reg_date}, ${cols.vat_place}, ${cols.fiscal_year_end}, ${cols.filings},
        ${cols.has_prev_accountant}, ${cols.prev_accountant}, ${cols.contact_name}, ${cols.contact_position}, ${cols.contact_phone}, ${cols.contact_email},
        ${cols.shareholders}::jsonb, ${cols.consent_at}, ${cols.consent_version}, ${cols.notes}, ${cols.raw}::jsonb
      )`;
    }
  } catch (error) {
    console.error("intake submit failed:", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
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
        name: cols.name_th,
        juristicId: formatTaxId(cols.juristic_id),
        contactName: cols.contact_name,
        contactPhone: cols.contact_phone,
        contactEmail: cols.contact_email,
        reviewUrl: `${origin}/onboarding`,
      });
      await sendEmail({ to: to.join(","), subject: built.subject, html: built.html, text: built.text });
    }
  } catch (error) {
    console.error("intake notify failed:", error);
  }

  return NextResponse.json({ ok: true });
}

function json(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}
