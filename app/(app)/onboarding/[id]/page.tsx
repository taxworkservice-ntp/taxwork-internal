import Link from "next/link";
import { notFound } from "next/navigation";
import { loadIntakeSubmissionById } from "@/lib/intake";
import { getFirmBranding } from "@/lib/branding";
import { getIntakeFileUrl } from "@/lib/actions/intake";
import { formatTaxId } from "@/lib/tax-id";
import PrintButton from "@/components/print-button";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2 py-0.5 text-sm">
      <span className="w-44 shrink-0 text-neutral-500">{label}</span>
      <span className="whitespace-pre-wrap">{value?.trim() ? value : "-"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1 border-t border-neutral-200 pt-3">
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function IntakeFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sub = await loadIntakeSubmissionById(id);
  if (!sub) notFound();
  const branding = await getFirmBranding();

  const signatureUrl = sub.signature_path ? await getIntakeFileUrl(sub.signature_path) : null;
  const address = [
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

  const docs: { label: string; path: string | null }[] = [
    { label: "ทะเบียนบ้าน (ที่ตั้งบริษัท)", path: sub.company_house_path },
    ...sub.shareholders.flatMap((sh, i) => [
      { label: `ผู้ถือหุ้น #${i + 1} — บัตรประชาชน (${sh.name})`, path: sh.idCardPath || null },
      { label: `ผู้ถือหุ้น #${i + 1} — ทะเบียนบ้าน (${sh.name})`, path: sh.houseRegPath || null },
    ]),
    { label: `ลายเซ็น (${sub.signer_name || "ผู้ลงนาม"})`, path: sub.signature_path },
  ];
  const docLinks: { label: string; url: string }[] = [];
  for (const d of docs) {
    if (!d.path) continue;
    const url = await getIntakeFileUrl(d.path);
    if (url) docLinks.push({ label: d.label, url });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/onboarding" className="text-sm text-neutral-500 hover:underline">
          ← กลับ
        </Link>
        <PrintButton />
      </div>

      <article className="space-y-4 rounded-lg border border-neutral-200 bg-white p-8 print:border-0 print:p-0">
        <header className="border-b border-neutral-300 pb-3">
          <div className="text-base font-bold">{branding.firmName}</div>
          <h1 className="mt-1 text-lg font-bold">แบบฟอร์มลงทะเบียนลูกค้า</h1>
          <div className="mt-1 text-xs text-neutral-500">
            สถานะ: {sub.status === "approved" ? "อนุมัติแล้ว" : sub.status === "rejected" ? "ปฏิเสธ" : "รอตรวจสอบ"}
            {" · "}ส่งเมื่อ {new Date(sub.created_at).toLocaleString("th-TH")}
            {sub.reviewed_at ? ` · ตรวจเมื่อ ${new Date(sub.reviewed_at).toLocaleString("th-TH")}` : ""}
          </div>
        </header>

        <Section title="1. ข้อมูลบริษัท">
          <Row label="ชื่อบริษัท (ไทย) ตัวเลือก 1" value={sub.name_th} />
          <Row label="ชื่อบริษัท (อังกฤษ) ตัวเลือก 1" value={sub.name_en} />
          <Row label="ชื่อบริษัท (ไทย) ตัวเลือก 2" value={sub.name_th2} />
          <Row label="ชื่อบริษัท (อังกฤษ) ตัวเลือก 2" value={sub.name_en2} />
          <Row label="เลขทะเบียนนิติบุคคล" value={formatTaxId(sub.juristic_id)} />
          <Row label="วันที่จดทะเบียน" value={sub.reg_date} />
          <Row
            label="ทุนจดทะเบียน / ชำระแล้ว"
            value={`${sub.capital_registered ?? "-"} / ${sub.capital_paid ?? "-"}`}
          />
          <Row label="ประเภทธุรกิจ / วัตถุประสงค์" value={sub.business_desc} />
        </Section>

        <Section title="2. ที่ตั้งสำนักงานใหญ่">
          <Row label="ที่อยู่จดทะเบียน" value={address} />
        </Section>

        <Section title="3. ภาษี & รอบบัญชี">
          <Row label="จดทะเบียน VAT" value={sub.vat_registered ? "ใช่" : "ไม่ใช่"} />
          {sub.vat_registered && <Row label="วันจดทะเบียน VAT" value={sub.vat_reg_date} />}
          {sub.vat_registered && <Row label="สถานที่ประกอบการ" value={sub.vat_place} />}
          <Row label="วันสิ้นสุดรอบปีบัญชี" value={sub.fiscal_year_end} />
          <Row label="แบบที่ต้องยื่น" value={sub.filings.join(", ")} />
          <Row
            label="สำนักบัญชีเดิม"
            value={sub.has_prev_accountant ? `มี — ${sub.prev_accountant ?? "-"}` : "ไม่มี"}
          />
        </Section>

        <Section title="4. ผู้ถือหุ้น / กรรมการ">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>ชื่อ–นามสกุล</th>
                  <th>เลขบัตร ปชช.</th>
                  <th>สัดส่วน</th>
                  <th>กรรมการ</th>
                  <th>โทร</th>
                  <th>อีเมล</th>
                </tr>
              </thead>
              <tbody>
                {sub.shareholders.map((sh, i) => (
                  <tr key={i}>
                    <td>{sh.name}</td>
                    <td className="font-mono text-xs">{sh.idNo || "-"}</td>
                    <td>{sh.percent ? `${sh.percent}%` : "-"}</td>
                    <td>{sh.isDirector ? "✓" : "-"}</td>
                    <td>{sh.phone || "-"}</td>
                    <td className="text-xs">{sh.email || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="5. ผู้ติดต่อ">
          <Row label="ชื่อ–นามสกุล" value={sub.contact_name} />
          <Row label="ตำแหน่ง" value={sub.contact_position} />
          <Row label="โทรศัพท์" value={sub.contact_phone} />
          <Row label="อีเมล" value={sub.contact_email} />
          {sub.notes && <Row label="หมายเหตุ" value={sub.notes} />}
        </Section>

        <Section title="6. การลงนาม">
          {signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureUrl} alt="ลายเซ็น" className="h-24 border-b border-neutral-400 object-contain" />
          ) : (
            <div className="h-16 text-xs text-neutral-400">— ไม่มีลายเซ็น —</div>
          )}
          <Row label="ผู้ลงนาม" value={sub.signer_name} />
          <Row
            label="ลงนามเมื่อ"
            value={sub.signed_at ? new Date(sub.signed_at).toLocaleString("th-TH") : null}
          />
          <p className="pt-2 text-xs text-neutral-500">
            ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นถูกต้อง และยินยอมให้เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล
            เพื่อการให้บริการทางบัญชีและภาษี ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
            {sub.consent_at ? ` (ยินยอมเมื่อ ${new Date(sub.consent_at).toLocaleString("th-TH")})` : ""}.
          </p>
        </Section>

        {docLinks.length > 0 && (
          <Section title="เอกสารแนบ">
            <ul className="list-inside list-disc text-sm">
              {docLinks.map((d, i) => (
                <li key={i}>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {d.label}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </article>
    </div>
  );
}
