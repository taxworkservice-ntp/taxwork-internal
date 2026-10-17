import { formatTaxId } from "@/lib/tax-id";

/** Presentational registration-evidence sheet, shared by the prospect preview
 *  and the staff print view. No hooks — usable from server or client parents. */

export type EvidenceShareholder = {
  name: string;
  idNo?: string;
  percent?: string;
  isDirector?: boolean;
  phone?: string;
  email?: string;
};

export type EvidenceDoc = { label: string; url?: string };

export type EvidenceData = {
  firmName: string;
  logoDataUri?: string | null;
  ref?: string | null;
  statusLabel?: string;
  submittedAt?: string | null;
  nameTh: string;
  nameEn?: string | null;
  nameTh2?: string | null;
  nameEn2?: string | null;
  juristicId?: string | null;
  regDate?: string | null;
  capitalRegistered?: string | number | null;
  capitalPaid?: string | number | null;
  businessDesc?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  addressText?: string | null;
  mapDesc?: string | null;
  contactName: string;
  contactPosition?: string | null;
  contactPhone: string;
  contactEmail: string;
  notes?: string | null;
  shareholders: EvidenceShareholder[];
  signatureSrc?: string | null;
  signerName?: string | null;
  signedAt?: string | null;
  consentAt?: string | null;
  docs: EvidenceDoc[];
  timelineNote?: string | null;
};

function maskTaxId(id: string): string {
  const formatted = formatTaxId(id);
  // Show only the last 4 digits: 0-XXXX-XXXXX-XX-19 -> mask the middle.
  const digits = id.replace(/\D/g, "");
  if (digits.length !== 13) return formatted;
  return `X-XXXX-XXXXX-XX-${digits.slice(-2)}`;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-3 py-0.5 text-sm">
      <span className="w-40 shrink-0 text-neutral-500">{label}</span>
      <span className="whitespace-pre-wrap">{value?.toString().trim() ? value : "-"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1 border-t border-neutral-200 pt-3">
      <h2 className="mb-1 text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function EvidenceSheet({ data }: { data: EvidenceData }) {
  return (
    <article className="space-y-4 rounded-lg border border-neutral-200 bg-white p-8 text-neutral-900 print:border-0 print:p-0">
      <header className="border-b border-neutral-300 pb-3">
        <div className="flex items-center gap-3">
          {data.logoDataUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.logoDataUri} alt="" className="h-9 max-w-[40%] object-contain" />
          ) : null}
          <div className="text-base font-bold">{data.firmName}</div>
        </div>
        <h1 className="mt-2 text-lg font-bold">แบบฟอร์มลงทะเบียนลูกค้า</h1>
        <div className="mt-1 text-xs text-neutral-500">
          {data.ref ? `เลขที่อ้างอิง ${data.ref} · ` : ""}
          {data.statusLabel ? `${data.statusLabel} · ` : ""}
          {data.submittedAt ? `ส่งเมื่อ ${new Date(data.submittedAt).toLocaleString("th-TH")}` : ""}
        </div>
      </header>

      <Section title="1. ข้อมูลบริษัท">
        <Row label="ชื่อบริษัท (ไทย)" value={data.nameTh} />
        <Row label="ชื่อบริษัท (อังกฤษ)" value={data.nameEn} />
        <Row
          label="เลขทะเบียนนิติบุคคล"
          value={data.juristicId ? maskTaxId(data.juristicId) : "— (รอจดทะเบียน)"}
        />
        <Row label="อีเมลบริษัท" value={data.companyEmail} />
        <Row label="โทรศัพท์บริษัท" value={data.companyPhone} />
        {(data.regDate || data.capitalRegistered || data.businessDesc) && (
          <>
            <Row label="วันที่จดทะเบียน" value={data.regDate} />
            <Row
              label="ทุนจดทะเบียน / ชำระแล้ว"
              value={
                data.capitalRegistered || data.capitalPaid
                  ? `${data.capitalRegistered ?? "-"} / ${data.capitalPaid ?? "-"}`
                  : null
              }
            />
            <Row label="ประเภทธุรกิจ" value={data.businessDesc} />
          </>
        )}
      </Section>

      <Section title="2. ที่ตั้งสำนักงานใหญ่">
        <Row label="ที่อยู่ (ตามทะเบียนบ้าน)" value={data.addressText || "ตามเอกสารที่แนบ"} />
        {data.mapDesc && <Row label="เส้นทางโดยสังเขป" value={data.mapDesc} />}
      </Section>

      <Section title="3. ผู้ถือหุ้น / กรรมการ">
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
              {data.shareholders.map((sh, i) => (
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

      <Section title="4. ผู้ติดต่อ">
        <Row label="ชื่อ–นามสกุล" value={data.contactName} />
        <Row label="ตำแหน่ง" value={data.contactPosition} />
        <Row label="โทรศัพท์" value={data.contactPhone} />
        <Row label="อีเมล" value={data.contactEmail} />
        {data.notes && <Row label="หมายเหตุ" value={data.notes} />}
      </Section>

      <Section title="5. การลงนาม">
        {data.signatureSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.signatureSrc}
            alt="ลายเซ็น"
            className="h-24 border-b border-neutral-400 object-contain"
          />
        ) : (
          <div className="h-16 text-xs text-neutral-400">— มีลายเซ็นในระบบ —</div>
        )}
        <Row label="ผู้ลงนาม" value={data.signerName} />
        <Row label="ลงนามเมื่อ" value={data.signedAt ? new Date(data.signedAt).toLocaleString("th-TH") : null} />
        <p className="pt-2 text-xs text-neutral-500">
          ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นถูกต้อง และยินยอมให้เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล
          เพื่อการให้บริการทางบัญชีและภาษี ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
          {data.consentAt ? ` (ยินยอมเมื่อ ${new Date(data.consentAt).toLocaleString("th-TH")})` : ""}.
        </p>
      </Section>

      {data.docs.length > 0 && (
        <Section title="เอกสารแนบ">
          <ul className="list-inside list-disc text-sm">
            {data.docs.map((d, i) => (
              <li key={i}>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {d.label}
                  </a>
                ) : (
                  d.label
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.timelineNote && (
        <p className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">{data.timelineNote}</p>
      )}
    </article>
  );
}
