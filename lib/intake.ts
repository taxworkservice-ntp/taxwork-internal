import "server-only";
import { sql } from "@/lib/db";

/**
 * Server helpers for prospect intake (public onboarding form). Token lookup and
 * path validation live here so both the public routes and the admin actions can
 * share them. Staff-only mutations live in lib/actions/intake.ts.
 */

export const INTAKE_LINK_TTL_DAYS = 30;
export const INTAKE_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const INTAKE_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export {
  INTAKE_CONSENT_VERSION,
  INTAKE_TIMELINE_NOTE,
  INTAKE_MIN_SHAREHOLDERS,
  INTAKE_MAX_SHAREHOLDERS,
} from "@/lib/intake-shared";

export type IntakeShareholder = {
  name: string;
  idNo: string;
  percent: string;
  isDirector: boolean;
  phone: string;
  email: string;
  idCardPath: string;
  houseRegPath: string;
};

export type IntakeLink = {
  id: string;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export type IntakeSubmission = {
  id: string;
  link_id: string;
  status: "submitted" | "approved" | "rejected";
  entity_type: string;
  name_th: string;
  name_en: string | null;
  name_th2: string | null;
  name_en2: string | null;
  juristic_id: string;
  reg_date: string | null;
  capital_registered: number | null;
  capital_paid: number | null;
  business_desc: string | null;
  addr_line: string | null;
  addr_moo: string | null;
  addr_soi: string | null;
  addr_road: string | null;
  addr_subdistrict: string | null;
  addr_district: string | null;
  addr_province: string | null;
  addr_postcode: string | null;
  company_house_path: string | null;
  company_map_path: string | null;
  company_map_desc: string | null;
  company_email: string | null;
  company_phone: string | null;
  vat_registered: boolean | null;
  vat_reg_date: string | null;
  vat_place: string | null;
  fiscal_year_end: string | null;
  filings: string[];
  has_prev_accountant: boolean | null;
  prev_accountant: string | null;
  contact_name: string;
  contact_position: string | null;
  contact_phone: string;
  contact_email: string;
  shareholders: IntakeShareholder[];
  consent_at: string | null;
  consent_version: string | null;
  signer_name: string | null;
  signature_path: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  notes: string | null;
  client_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Normalize a DB row (dates → ISO strings, shareholders → typed array). */
export function toSubmission(row: Record<string, unknown>): IntakeSubmission {
  return {
    ...(row as unknown as IntakeSubmission),
    status: (row.status as IntakeSubmission["status"]) ?? "submitted",
    reg_date: row.reg_date ? String(row.reg_date).slice(0, 10) : null,
    vat_reg_date: row.vat_reg_date ? String(row.vat_reg_date).slice(0, 10) : null,
    capital_registered: row.capital_registered == null ? null : Number(row.capital_registered),
    capital_paid: row.capital_paid == null ? null : Number(row.capital_paid),
    filings: Array.isArray(row.filings) ? (row.filings as string[]) : [],
    shareholders: Array.isArray(row.shareholders)
      ? (row.shareholders as IntakeShareholder[])
      : [],
    created_at: str(row.created_at) ?? "",
    reviewed_at: str(row.reviewed_at),
    consent_at: str(row.consent_at),
    signed_at: str(row.signed_at),
  };
}

export type IntakeStatusKind = "open" | "expired" | "revoked";

export function intakeStatus(link: {
  expires_at: string | null;
  revoked_at: string | null;
}): IntakeStatusKind {
  if (link.revoked_at) return "revoked";
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return "expired";
  return "open";
}

export async function loadIntakeByToken(
  token: string
): Promise<{ link: IntakeLink; submission: IntakeSubmission | null } | null> {
  const links = (await sql`
    select id, token, label, created_at, expires_at, revoked_at
    from intake_links where token=${token} limit 1
  `) as IntakeLink[];
  const link = links[0];
  if (!link) return null;

  const subs = (await sql`
    select * from intake_submissions where link_id=${link.id}
    order by created_at desc limit 1
  `) as Record<string, unknown>[];
  return { link, submission: subs[0] ? toSubmission(subs[0]) : null };
}

/** Load a submission by id (for the staff print/preview view). */
export async function loadIntakeSubmissionById(
  id: string
): Promise<IntakeSubmission | null> {
  const rows = (await sql`select * from intake_submissions where id=${id} limit 1`) as Record<
    string,
    unknown
  >[];
  return rows[0] ? toSubmission(rows[0]) : null;
}

export function intakePathPrefix(linkId: string): string {
  return `intake/${linkId}/`;
}

/** Whether a submitted R2 path belongs to this link's upload folder. */
export function isValidIntakePath(path: unknown, linkId: string): path is string {
  return typeof path === "string" && path.startsWith(intakePathPrefix(linkId));
}

/** Strip path separators / control chars from a client-supplied filename. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 80);
}
