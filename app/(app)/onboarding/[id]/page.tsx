import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { loadIntakeSubmissionById } from "@/lib/intake";
import { getFirmBranding } from "@/lib/branding";
import { getIntakeFileUrl } from "@/lib/actions/intake";
import { INTAKE_TIMELINE_NOTE, shareholderIdDocs } from "@/lib/intake-shared";
import type { EvidenceData } from "@/components/evidence-sheet";
import IntakeProcessing from "@/components/intake-processing";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  submitted: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
};

export default async function IntakeRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sub = await loadIntakeSubmissionById(id);
  if (!sub) notFound();
  const branding = await getFirmBranding();

  const signatureSrc = sub.signature_path ? await getIntakeFileUrl(sub.signature_path) : null;

  const docSpecs: { label: string; path: string | null }[] = [
    { label: "ทะเบียนบ้าน (ที่ตั้งบริษัท)", path: sub.company_house_path },
    { label: "ภาพแผนที่ Google Maps", path: sub.company_map_path },
    ...sub.shareholders.flatMap((sh, i) => {
      const who = sh.name || `ผู้ถือหุ้น #${i + 1}`;
      const { front, back } = shareholderIdDocs(sh);
      if (front && back && front !== back)
        return [
          { label: `บัตรประชาชนด้านหน้า — ${who}`, path: front },
          { label: `บัตรประชาชนด้านหลัง — ${who}`, path: back },
        ];
      return [{ label: `บัตรประชาชน — ${who}`, path: front || null }];
    }),
    { label: `ลายเซ็น (${sub.signer_name || "ผู้ลงนาม"})`, path: sub.signature_path },
  ];
  const docs: { label: string; url?: string }[] = [];
  for (const d of docSpecs) {
    if (!d.path) continue;
    const url = await getIntakeFileUrl(d.path);
    docs.push(url ? { label: d.label, url } : { label: d.label });
  }

  const addressText = [
    sub.addr_line,
    sub.addr_moo ? `หมู่ ${sub.addr_moo}` : null,
    sub.addr_soi ? `ซอย${sub.addr_soi}` : null,
    sub.addr_road ? `ถนน${sub.addr_road}` : null,
    sub.addr_subdistrict,
    sub.addr_district,
    sub.addr_province,
    sub.addr_postcode,
  ]
    .filter(Boolean)
    .join(" ");

  const evidence: EvidenceData = {
    firmName: branding.firmName,
    logoDataUri: branding.logoDataUri,
    ref: `INT-${sub.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    statusLabel: STATUS_LABEL[sub.status] ?? sub.status,
    submittedAt: sub.created_at,
    nameTh: sub.name_th,
    nameEn: sub.name_en,
    juristicId: sub.juristic_id,
    regDate: sub.reg_date,
    capitalRegistered: sub.capital_registered,
    capitalPaid: sub.capital_paid,
    businessDesc: sub.business_desc,
    companyEmail: sub.company_email,
    companyPhone: sub.company_phone,
    addressText,
    mapDesc: sub.company_map_desc,
    contactName: sub.contact_name,
    contactPosition: sub.contact_position,
    contactPhone: sub.contact_phone,
    contactEmail: sub.contact_email,
    notes: sub.notes,
    shareholders: sub.shareholders,
    signatureSrc,
    signerName: sub.signer_name,
    signedAt: sub.signed_at,
    consentAt: sub.consent_at,
    docs,
    timelineNote: INTAKE_TIMELINE_NOTE,
  };

  let clientName: string | null = null;
  if (sub.client_id) {
    const rows = (await sql`select name from clients where id=${sub.client_id} limit 1`) as {
      name: string;
    }[];
    clientName = rows[0]?.name ?? null;
  }

  return (
    <IntakeProcessing
      id={sub.id}
      evidence={evidence}
      status={sub.status}
      clientId={sub.client_id}
      clientName={clientName}
      linkLabel={null}
      issuedTaxId={sub.tax_id_issued}
      defaults={{
        address: addressText || "",
        vat_registered: sub.vat_registered,
        vat_reg_date: sub.vat_reg_date ?? "",
        vat_place: sub.vat_place ?? "",
        fiscal_year_end: sub.fiscal_year_end ?? "",
        filings: sub.filings,
      }}
    />
  );
}
