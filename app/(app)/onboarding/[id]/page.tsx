import Link from "next/link";
import { notFound } from "next/navigation";
import { loadIntakeSubmissionById } from "@/lib/intake";
import { getFirmBranding } from "@/lib/branding";
import { getIntakeFileUrl } from "@/lib/actions/intake";
import { INTAKE_TIMELINE_NOTE } from "@/lib/intake-shared";
import EvidenceSheet, { type EvidenceData } from "@/components/evidence-sheet";
import PrintButton from "@/components/print-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  submitted: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
};

export default async function IntakeFormPage({
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
    ...sub.shareholders.map((sh, i) => ({
      label: `บัตรประชาชน — ${sh.name || `ผู้ถือหุ้น #${i + 1}`}`,
      path: sh.idCardPath || null,
    })),
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
    nameTh2: sub.name_th2,
    nameEn2: sub.name_en2,
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/onboarding" className="text-sm text-neutral-500 hover:underline">
          ← กลับ
        </Link>
        <PrintButton />
      </div>
      <EvidenceSheet data={evidence} />
    </div>
  );
}
