"use server";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { generatePublicId } from "@/lib/ids";
import { appOrigin } from "@/lib/app-url";
import { R2_BUCKET, signedUrl } from "@/lib/r2";
import { sendEmail } from "@/lib/email/resend";
import { buildIntakeApprovedEmail } from "@/lib/email/intake-email";
import {
  INTAKE_LINK_TTL_DAYS,
  toSubmission,
  type IntakeLink,
  type IntakeShareholder,
  type IntakeSubmission,
} from "@/lib/intake";

export type ActionResult = { ok: true } | { ok: false; error: string };

function actionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function str(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export type IntakeLinkRow = IntakeLink & {
  submission_status: string | null;
  submission_name: string | null;
  url: string;
};

export type IntakeSubmissionRow = IntakeSubmission & { link_label: string | null };

/** Mint a fresh onboarding link (30-day expiry) and return its public URL. */
export async function createIntakeLink(
  label?: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const token = generatePublicId(20);
    const expires = new Date(Date.now() + INTAKE_LINK_TTL_DAYS * 86400000);
    await sql`insert into intake_links (token, label, created_by, expires_at)
      values (${token}, ${label?.trim() || null}, ${user.email}, ${expires.toISOString()})`;
    const origin = await appOrigin();
    return { ok: true, url: `${origin}/onboard/${token}` };
  } catch (error) {
    console.error("createIntakeLink failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

export async function listIntakeLinks(): Promise<IntakeLinkRow[]> {
  await requireUser();
  const rows = (await sql`
    select l.id, l.token, l.label, l.created_at, l.expires_at, l.revoked_at,
      (select status from intake_submissions s where s.link_id=l.id order by created_at desc limit 1) as submission_status,
      (select name_th from intake_submissions s where s.link_id=l.id order by created_at desc limit 1) as submission_name
    from intake_links l
    order by l.created_at desc
    limit 100
  `) as (IntakeLink & {
    submission_status: string | null;
    submission_name: string | null;
  })[];
  const origin = await appOrigin();
  return rows.map((r) => ({
    ...r,
    created_at: str(r.created_at) ?? "",
    expires_at: str(r.expires_at),
    revoked_at: str(r.revoked_at),
    url: `${origin}/onboard/${r.token}`,
  }));
}

export async function revokeIntakeLink(id: string): Promise<ActionResult> {
  try {
    await requireUser();
    await sql`update intake_links set revoked_at=${new Date().toISOString()} where id=${id}`;
    return { ok: true };
  } catch (error) {
    console.error("revokeIntakeLink failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

export async function listIntakeSubmissions(): Promise<IntakeSubmissionRow[]> {
  await requireUser();
  const rows = (await sql`
    select s.*, l.label as link_label
    from intake_submissions s
    join intake_links l on l.id = s.link_id
    order by s.created_at desc
    limit 100
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    ...toSubmission(r),
    link_label: (r.link_label as string | null) ?? null,
  }));
}

function composeAddress(sub: IntakeSubmission): string {
  return [
    sub.addr_line,
    sub.addr_moo ? `หมู่ ${sub.addr_moo}` : null,
    sub.addr_soi ? `ซอย${sub.addr_soi}` : null,
    sub.addr_road ? `ถนน${sub.addr_road}` : null,
    sub.addr_subdistrict,
    sub.addr_district,
    sub.addr_province,
    sub.addr_postcode,
  ]
    .filter((p) => p && String(p).trim())
    .join(" ");
}

function baseName(path: string): string {
  return path.split("/").pop() || "file";
}
function mimeFromName(name: string): string | null {
  const l = name.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".webp")) return "image/webp";
  if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

/**
 * Approve a submission → create (or link to) a client, insert shareholders, and
 * attach the uploaded documents to the client's files. Duplicate-guards by the
 * 13-digit registration number.
 */
export type IntakeReviewPatch = {
  address?: string | null;
  vat_registered?: boolean | null;
  vat_reg_date?: string | null;
  vat_place?: string | null;
  fiscal_year_end?: string | null;
  filings?: string[] | null;
};

async function applyReviewPatch(id: string, review?: IntakeReviewPatch): Promise<void> {
  if (!review) return;
  const addr = review.address?.trim() || null;
  await sql`update intake_submissions set
    addr_line=${addr}, addr_moo=null, addr_soi=null, addr_road=null,
    addr_subdistrict=null, addr_district=null, addr_province=null, addr_postcode=null,
    vat_registered=${review.vat_registered ?? null},
    vat_reg_date=${review.vat_reg_date?.trim() || null},
    vat_place=${review.vat_place?.trim() || null},
    fiscal_year_end=${review.fiscal_year_end?.trim() || null},
    filings=${review.filings ?? []}
    where id=${id}`;
}

/**
 * Approve a submission for DBD filing (registration pipeline). Marks it
 * reviewed WITHOUT creating a `clients` row — the company does not exist as a
 * bookkeeping client until it is explicitly created later.
 */
export async function approveForFiling(
  id: string,
  review?: IntakeReviewPatch
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await applyReviewPatch(id, review);

    const rows = (await sql`select * from intake_submissions where id=${id}`) as Record<
      string,
      unknown
    >[];
    const sub = rows[0] ? toSubmission(rows[0]) : null;
    if (!sub) return { ok: false, error: "ไม่พบคำขอ" };
    if (sub.status !== "submitted") return { ok: false, error: "คำขอนี้ถูกตรวจสอบแล้ว" };
    if (!composeAddress(sub).trim())
      return { ok: false, error: "กรุณากรอกที่อยู่จดทะเบียน (จากทะเบียนบ้าน) ก่อนอนุมัติ" };

    await sql`update intake_submissions
      set status='approved', reviewed_by=${user.email}, reviewed_at=${new Date().toISOString()}
      where id=${id}`;

    // Best-effort courtesy email to the prospect.
    try {
      if (sub.contact_email && process.env.REPORT_FROM_EMAIL) {
        const settings = (await sql`
          select firm_name, firm_phone, firm_line from app_settings where id=1
        `) as { firm_name: string | null; firm_phone: string | null; firm_line: string | null }[];
        const s = settings[0];
        const built = buildIntakeApprovedEmail({
          firmName: s?.firm_name?.trim() || "Taxwork",
          contactName: sub.contact_name,
          companyName: sub.name_th,
          firmPhone: s?.firm_phone?.trim() || null,
          firmLine: s?.firm_line?.trim() || null,
        });
        await sendEmail({
          to: sub.contact_email,
          subject: built.subject,
          html: built.html,
          text: built.text,
        });
      }
    } catch (error) {
      console.error("intake ack email failed:", error);
    }

    return { ok: true };
  } catch (error) {
    console.error("approveForFiling failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

/**
 * Create the bookkeeping client for an already-filed registration. This is a
 * separate, explicit step taken only when the company hires the bookkeeping
 * service — never implicitly on filing approval.
 */
export async function createBookkeepingClient(
  id: string
): Promise<{ ok: true; clientId: string; duplicate: boolean } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const rows = (await sql`select * from intake_submissions where id=${id}`) as Record<
      string,
      unknown
    >[];
    const sub = rows[0] ? toSubmission(rows[0]) : null;
    if (!sub) return { ok: false, error: "ไม่พบคำขอ" };
    if (sub.status !== "approved" || sub.client_id)
      return { ok: false, error: "คำขอนี้สร้างเป็นลูกค้าแล้ว หรือยังไม่ผ่านการอนุมัติยื่นจดทะเบียน" };
    if (!composeAddress(sub).trim())
      return { ok: false, error: "กรุณากรอกที่อยู่จดทะเบียนก่อนสร้างลูกค้า" };

    const taxId = sub.tax_id_issued || sub.juristic_id || null;
    const existing = taxId
      ? ((await sql`
          select id from clients
          where regexp_replace(coalesce(tax_id, ''), '\\D', '', 'g') = ${taxId}
          limit 1
        `) as { id: string }[])
      : [];

    let clientId: string;
    let duplicate = false;

    if (existing[0]) {
      clientId = existing[0].id;
      duplicate = true;
    } else {
      const notesParts: string[] = [];
      if (sub.business_desc) notesParts.push(sub.business_desc);
      if (sub.has_prev_accountant) notesParts.push(`สำนักบัญชีเดิม: ${sub.prev_accountant || "-"}`);
      if (sub.notes) notesParts.push(sub.notes);

      const inserted = (await sql`
        insert into clients (name, tax_id, email, phone, address, notes)
        values (${sub.name_th}, ${taxId}, ${sub.company_email || sub.contact_email}, ${sub.company_phone || sub.contact_phone},
                ${composeAddress(sub)}, ${notesParts.join("\n") || null})
        returning id
      `) as { id: string }[];
      clientId = inserted[0].id;

      // Shareholders (single director enforced). Percent is numeric (validated
      // to total 100 at submit) and stored in `shares`.
      let directorSet = false;
      for (const sh of sub.shareholders) {
        const isDirector = Boolean(sh.isDirector) && !directorSet;
        if (isDirector) directorSet = true;
        const pct = Number(String(sh.percent ?? "").replace(/%/g, ""));
        const shares = Number.isFinite(pct) ? pct : null;
        const notes = shares != null ? `สัดส่วน ${shares}%` : null;
        await sql`insert into shareholders (client_id, name, tax_id, email, phone, shares, is_director, notes)
          values (${clientId}, ${sh.name}, ${sh.idNo || null}, ${sh.email || null}, ${sh.phone || null},
                  ${shares}, ${isDirector}, ${notes})`;
      }

      // Attach documents to the client's files.
      const attach = async (path: string | null | undefined, category: string) => {
        if (!path) return;
        const name = baseName(path);
        await sql`insert into files (client_id, storage_path, file_name, size_bytes, mime_type, category)
          values (${clientId}, ${path}, ${name}, ${0}, ${mimeFromName(name)}, ${category})`;
      };
      await attach(sub.company_house_path, "company-house");
      await attach(sub.company_map_path, "company-map");
      for (const sh of sub.shareholders) {
        const front = sh.idCardFrontPath || sh.idCardPath || null;
        const back = sh.idCardBackPath || null;
        if (front && back && front !== back) {
          await attach(front, "shareholder-id-front");
          await attach(back, "shareholder-id-back");
        } else {
          // Legacy single upload (or identical paths) — keep one file row.
          await attach(front || back, "shareholder-id");
        }
        await attach(sh.houseRegPath, "shareholder-house");
      }
      await attach(sub.signature_path, "signature");
    }

    await sql`update intake_submissions
      set client_id=${clientId}, reviewed_by=${user.email}, reviewed_at=${new Date().toISOString()}
      where id=${id}`;

    return { ok: true, clientId, duplicate };
  } catch (error) {
    console.error("createBookkeepingClient failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

/**
 * Fill in shareholder ID numbers transcribed by staff from the uploaded ID
 * cards. The public form no longer asks for them. Allowed while the record is
 * still open (pending, or filed without a client yet).
 */
export async function updateIntakeShareholderIds(
  id: string,
  ids: string[]
): Promise<ActionResult> {
  try {
    await requireUser();
    const rows = (await sql`select shareholders from intake_submissions where id=${id}`) as {
      shareholders: IntakeShareholder[];
    }[];
    const current = Array.isArray(rows[0]?.shareholders) ? rows[0].shareholders : [];
    if (ids.length !== current.length)
      return { ok: false, error: "จำนวนผู้ถือหุ้นไม่ตรงกับที่ส่งมา" };
    const cleaned = ids.map((v) => String(v ?? "").replace(/\D/g, "").slice(0, 20));
    for (const d of cleaned) {
      if (d && d.length !== 13) return { ok: false, error: "เลขบัตรต้องมี 13 หลัก หรือเว้นว่าง" };
    }
    const next = current.map((sh, i) => ({ ...sh, idNo: cleaned[i] }));
    await sql`update intake_submissions set shareholders=${JSON.stringify(next)}::jsonb
      where id=${id} and (status='submitted' or (status='approved' and client_id is null))`;
    return { ok: true };
  } catch (error) {
    console.error("updateIntakeShareholderIds failed:", error);
    return { ok: false, error: actionError(error) };
  }
}
export async function updateIssuedTaxId(id: string, taxId: string): Promise<ActionResult> {
  try {
    await requireUser();
    const digits = taxId.replace(/\D/g, "");
    if (digits) {
      const { checkTaxId } = await import("@/lib/tax-id");
      if (!checkTaxId(digits).ok) return { ok: false, error: "เลขทะเบียน 13 หลักไม่ถูกต้อง" };
    }
    await sql`update intake_submissions set tax_id_issued=${digits || null} where id=${id}`;
    return { ok: true };
  } catch (error) {
    console.error("updateIssuedTaxId failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

export async function rejectIntakeSubmission(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await sql`update intake_submissions
      set status='rejected', reviewed_by=${user.email}, reviewed_at=${new Date().toISOString()}
      where id=${id}`;
    return { ok: true };
  } catch (error) {
    console.error("rejectIntakeSubmission failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

/**
 * Save staff-transcribed address + tax fields. Staging only — nothing reaches
 * `clients` until the bookkeeping client is explicitly created. Allowed while
 * the record is still open (pending, or filed without a client yet).
 */
export async function updateIntakeSubmission(
  id: string,
  review: IntakeReviewPatch
): Promise<ActionResult> {
  try {
    await requireUser();
    const addr = review.address?.trim() || null;
    await sql`update intake_submissions set
      addr_line=${addr}, addr_moo=null, addr_soi=null, addr_road=null,
      addr_subdistrict=null, addr_district=null, addr_province=null, addr_postcode=null,
      vat_registered=${review.vat_registered ?? null},
      vat_reg_date=${review.vat_reg_date?.trim() || null},
      vat_place=${review.vat_place?.trim() || null},
      fiscal_year_end=${review.fiscal_year_end?.trim() || null},
      filings=${review.filings ?? []}
      where id=${id} and (status='submitted' or (status='approved' and client_id is null))`;
    return { ok: true };
  } catch (error) {
    console.error("updateIntakeSubmission failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

/** Push a test LINE message to all configured admin recipients. */
export async function sendTestLineNotify(): Promise<ActionResult> {
  try {
    await requireUser();
    const { adminLineRecipients, pushLineText } = await import("@/lib/line");
    const to = adminLineRecipients();
    if (!to.length)
      return { ok: false, error: "ยังไม่ได้ตั้งค่า ADMIN_LINE_USER_IDS" };
    const errors: string[] = [];
    for (const recipient of to) {
      const res = await pushLineText({
        to: recipient,
        text: "ทดสอบแจ้งเตือน LINE จากระบบ Taxwork (กรุณาเพิกเฉย)",
      });
      if (!res.ok) errors.push(`${recipient}: ${res.error}`);
    }
    if (errors.length) return { ok: false, error: `ส่งไม่สำเร็จ — ${errors.join("; ")}` };
    return { ok: true };
  } catch (error) {
    console.error("sendTestLineNotify failed:", error);
    return { ok: false, error: actionError(error) };
  }
}

/** Short-lived signed URL to preview an uploaded intake document. */
export async function getIntakeFileUrl(path: string): Promise<string | null> {
  await requireUser();
  if (!path.startsWith("intake/")) return null;
  try {
    return await signedUrl(new GetObjectCommand({ Bucket: R2_BUCKET, Key: path }));
  } catch {
    return null;
  }
}
