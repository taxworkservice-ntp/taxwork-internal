"use client";

import { useRef, useState } from "react";
import type { FirmBranding } from "@/lib/branding";
import type { IntakeSubmission } from "@/lib/intake";

const FILINGS = ["ภ.พ.30", "ภ.ง.ด.1", "ภ.ง.ด.3", "ภ.ง.ด.53", "ภ.ง.ด.50/51", "ประกันสังคม"];
const MAX_SHAREHOLDERS = 10;

type Sh = {
  key: string;
  name: string;
  idNo: string;
  percent: string;
  isDirector: boolean;
  phone: string;
  email: string;
  idCardPath: string;
  idCardName: string;
  houseRegPath: string;
  houseRegName: string;
};

function newSh(): Sh {
  return {
    key: Math.random().toString(36).slice(2),
    name: "",
    idNo: "",
    percent: "",
    isDirector: false,
    phone: "",
    email: "",
    idCardPath: "",
    idCardName: "",
    houseRegPath: "",
    houseRegName: "",
  };
}

function mimeFor(file: File): string {
  if (file.type) return file.type;
  const l = file.name.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-1 text-sm font-semibold text-neutral-800">{children}</h2>;
}

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
  type = "text",
  className,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function UploadBox({
  label,
  required,
  uploadedName,
  onPick,
  busy,
}: {
  label: string;
  required?: boolean;
  uploadedName: string;
  onPick: (file: File) => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="btn text-xs"
        onClick={() => ref.current?.click()}
        disabled={busy}
      >
        {busy ? "กำลังอัปโหลด…" : "เลือกไฟล์"}
      </button>
      <span className="truncate text-xs">
        {label} {required && <span className="text-red-500">*</span>}
        {uploadedName && <span className="ml-1 text-emerald-600">✓ {uploadedName}</span>}
      </span>
    </div>
  );
}

export default function OnboardForm({
  token,
  branding,
  initial,
}: {
  token: string;
  branding: FirmBranding;
  initial: IntakeSubmission | null;
}) {
  const [f, setF] = useState({
    name_th: initial?.name_th ?? "",
    name_en: initial?.name_en ?? "",
    name_th2: initial?.name_th2 ?? "",
    name_en2: initial?.name_en2 ?? "",
    juristic_id: initial?.juristic_id ?? "",
    reg_date: initial?.reg_date ?? "",
    capital_registered: initial?.capital_registered != null ? String(initial.capital_registered) : "",
    capital_paid: initial?.capital_paid != null ? String(initial.capital_paid) : "",
    business_desc: initial?.business_desc ?? "",
    addr_line: initial?.addr_line ?? "",
    addr_moo: initial?.addr_moo ?? "",
    addr_soi: initial?.addr_soi ?? "",
    addr_road: initial?.addr_road ?? "",
    addr_subdistrict: initial?.addr_subdistrict ?? "",
    addr_district: initial?.addr_district ?? "",
    addr_province: initial?.addr_province ?? "",
    addr_postcode: initial?.addr_postcode ?? "",
    vat_registered: initial?.vat_registered ?? false,
    vat_reg_date: initial?.vat_reg_date ?? "",
    vat_place: initial?.vat_place ?? "",
    fiscal_year_end: initial?.fiscal_year_end ?? "31 ธันวาคม",
    has_prev_accountant: initial?.has_prev_accountant ?? false,
    prev_accountant: initial?.prev_accountant ?? "",
    contact_name: initial?.contact_name ?? "",
    contact_position: initial?.contact_position ?? "",
    contact_phone: initial?.contact_phone ?? "",
    contact_email: initial?.contact_email ?? "",
    notes: initial?.notes ?? "",
  });
  const [filings, setFilings] = useState<string[]>(initial?.filings ?? []);
  const [companyHouse, setCompanyHouse] = useState({
    path: initial?.company_house_path ?? "",
    name: initial?.company_house_path ? "แนบแล้ว" : "",
  });
  const [shs, setShs] = useState<Sh[]>(
    initial?.shareholders?.length
      ? initial.shareholders.map((s) => ({
          key: Math.random().toString(36).slice(2),
          name: s.name ?? "",
          idNo: s.idNo ?? "",
          percent: s.percent ?? "",
          isDirector: Boolean(s.isDirector),
          phone: s.phone ?? "",
          email: s.email ?? "",
          idCardPath: s.idCardPath ?? "",
          idCardName: s.idCardPath ? "แนบแล้ว" : "",
          houseRegPath: s.houseRegPath ?? "",
          houseRegName: s.houseRegPath ? "แนบแล้ว" : "",
        }))
      : [newSh()]
  );
  const [consent, setConsent] = useState(Boolean(initial?.consent_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [uploading, setUploading] = useState<string>("");

  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const setSh = (key: string, patch: Partial<Sh>) =>
    setShs((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  async function upload(kind: string, file: File): Promise<string> {
    const res = await fetch(`/api/onboard/${token}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        fileName: file.name,
        contentType: mimeFor(file),
        size: file.size,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; path?: string; error?: string };
    if (!res.ok || !data.url || !data.path) throw new Error(data.error || "อัปโหลดไม่สำเร็จ");
    const put = await fetch(data.url, {
      method: "PUT",
      headers: { "Content-Type": mimeFor(file) },
      body: file,
    });
    if (!put.ok) throw new Error("อัปโหลดไปที่เซิร์ฟเวอร์ไม่สำเร็จ");
    return data.path;
  }

  async function pickCompanyHouse(file: File) {
    setUploading("company");
    setError("");
    try {
      const path = await upload("company_house", file);
      setCompanyHouse({ path, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading("");
    }
  }

  async function pickShFile(sh: Sh, kind: "shareholder_id" | "shareholder_house", file: File) {
    setUploading(`${sh.key}:${kind}`);
    setError("");
    try {
      const path = await upload(kind, file);
      if (kind === "shareholder_id") setSh(sh.key, { idCardPath: path, idCardName: file.name });
      else setSh(sh.key, { houseRegPath: path, houseRegName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading("");
    }
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/onboard/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          filings,
          company_house_path: companyHouse.path,
          shareholders: shs.map((s) => ({
            name: s.name,
            idNo: s.idNo,
            percent: s.percent,
            isDirector: s.isDirector,
            phone: s.phone,
            email: s.email,
            idCardPath: s.idCardPath,
            houseRegPath: s.houseRegPath,
          })),
          consent,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "ส่งข้อมูลไม่สำเร็จ");
        return;
      }
      setDone(true);
    } catch {
      setError("ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <div className="card w-full space-y-2 py-8">
          <p className="text-base font-semibold text-emerald-700">ส่งข้อมูลเรียบร้อยแล้ว ✓</p>
          <p className="text-sm text-neutral-500">
            เราได้รับข้อมูลของท่านแล้ว และจะติดต่อกลับโดยเร็ว ขอบคุณค่ะ
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        {branding.logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoDataUri} alt={branding.firmName} className="h-9 max-w-[40%] object-contain" />
        ) : null}
        <div>
          <h1 className="text-lg font-bold">ลงทะเบียนลูกค้าใหม่</h1>
          <p className="text-xs text-neutral-500">{branding.firmName}</p>
        </div>
      </header>

      <div className="space-y-5">
        <section className="card space-y-3">
          <SectionTitle>1. ข้อมูลบริษัท</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อบริษัท (ไทย) ตัวเลือก 1" required value={f.name_th} onChange={(v) => set("name_th", v)} />
            <Field label="ชื่อบริษัท (อังกฤษ) ตัวเลือก 1" value={f.name_en} onChange={(v) => set("name_en", v)} />
            <Field label="ชื่อบริษัท (ไทย) ตัวเลือก 2" value={f.name_th2} onChange={(v) => set("name_th2", v)} />
            <Field label="ชื่อบริษัท (อังกฤษ) ตัวเลือก 2" value={f.name_en2} onChange={(v) => set("name_en2", v)} />
          </div>
          <Field
            label="เลขทะเบียนนิติบุคคล (13 หลัก)"
            required
            value={f.juristic_id}
            onChange={(v) => set("juristic_id", v)}
            placeholder="0-0000-00000-00-0"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="วันที่จดทะเบียน" type="date" value={f.reg_date} onChange={(v) => set("reg_date", v)} />
            <Field label="ทุนจดทะเบียน (บาท)" value={f.capital_registered} onChange={(v) => set("capital_registered", v)} />
            <Field label="ทุนชำระแล้ว (บาท)" value={f.capital_paid} onChange={(v) => set("capital_paid", v)} />
          </div>
          <label className="block">
            <span className="label">ประเภทธุรกิจ / วัตถุประสงค์</span>
            <textarea className="input h-20" value={f.business_desc} onChange={(e) => set("business_desc", e.target.value)} />
          </label>
        </section>

        <section className="card space-y-3">
          <SectionTitle>2. ที่ตั้งสำนักงานใหญ่</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="เลขที่ / อาคาร / ห้อง" required value={f.addr_line} onChange={(v) => set("addr_line", v)} />
            <Field label="หมู่" value={f.addr_moo} onChange={(v) => set("addr_moo", v)} />
            <Field label="ซอย" value={f.addr_soi} onChange={(v) => set("addr_soi", v)} />
            <Field label="ถนน" value={f.addr_road} onChange={(v) => set("addr_road", v)} />
            <Field label="แขวง / ตำบล" required value={f.addr_subdistrict} onChange={(v) => set("addr_subdistrict", v)} />
            <Field label="เขต / อำเภอ" required value={f.addr_district} onChange={(v) => set("addr_district", v)} />
            <Field label="จังหวัด" required value={f.addr_province} onChange={(v) => set("addr_province", v)} />
            <Field label="รหัสไปรษณีย์" required value={f.addr_postcode} onChange={(v) => set("addr_postcode", v)} />
          </div>
          <UploadBox
            label="สำเนาทะเบียนบ้าน (ที่ตั้งบริษัท)"
            required
            uploadedName={companyHouse.name}
            busy={uploading === "company"}
            onPick={pickCompanyHouse}
          />
        </section>

        <section className="card space-y-3">
          <SectionTitle>3. ภาษี & รอบบัญชี</SectionTitle>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={f.vat_registered} onChange={() => set("vat_registered", true)} />
              จดทะเบียน VAT
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!f.vat_registered} onChange={() => set("vat_registered", false)} />
              ไม่ได้จด VAT
            </label>
          </div>
          {f.vat_registered && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="วันจดทะเบียน VAT" type="date" value={f.vat_reg_date} onChange={(v) => set("vat_reg_date", v)} />
              <Field label="สถานที่ประกอบการ" value={f.vat_place} onChange={(v) => set("vat_place", v)} />
            </div>
          )}
          <Field label="วันสิ้นสุดรอบปีบัญชี" value={f.fiscal_year_end} onChange={(v) => set("fiscal_year_end", v)} />
          <div>
            <span className="label">แบบที่ต้องยื่น (ถ้าทราบ)</span>
            <div className="flex flex-wrap gap-3 text-sm">
              {FILINGS.map((code) => (
                <label key={code} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filings.includes(code)}
                    onChange={(e) =>
                      setFilings((prev) => (e.target.checked ? [...prev, code] : prev.filter((x) => x !== code)))
                    }
                  />
                  {code}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="label mb-0">เคยมีสำนักบัญชีเดิม</span>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={f.has_prev_accountant} onChange={() => set("has_prev_accountant", true)} />
              มี
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!f.has_prev_accountant} onChange={() => set("has_prev_accountant", false)} />
              ไม่มี
            </label>
          </div>
          {f.has_prev_accountant && (
            <Field label="ชื่อสำนักบัญชีเดิม" value={f.prev_accountant} onChange={(v) => set("prev_accountant", v)} />
          )}
        </section>

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>4. ผู้ถือหุ้น / กรรมการ</SectionTitle>
            {shs.length < MAX_SHAREHOLDERS && (
              <button type="button" className="btn text-xs" onClick={() => setShs((p) => [...p, newSh()])}>
                + เพิ่มรายชื่อ
              </button>
            )}
          </div>
          {shs.map((s, i) => (
            <div key={s.key} className="space-y-3 rounded-lg border border-neutral-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">ผู้ถือหุ้น #{i + 1}</span>
                {shs.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-neutral-400 hover:text-red-600"
                    onClick={() => setShs((p) => p.filter((x) => x.key !== s.key))}
                  >
                    ลบ
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ชื่อ–นามสกุล" required value={s.name} onChange={(v) => setSh(s.key, { name: v })} />
                <Field label="เลขบัตรประชาชน / ผู้เสียภาษี" value={s.idNo} onChange={(v) => setSh(s.key, { idNo: v })} />
                <Field label="สัดส่วนหุ้น (%)" value={s.percent} onChange={(v) => setSh(s.key, { percent: v })} />
                <Field label="โทรศัพท์" required value={s.phone} onChange={(v) => setSh(s.key, { phone: v })} />
                <Field label="อีเมล" required value={s.email} onChange={(v) => setSh(s.key, { email: v })} />
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={s.isDirector} onChange={(e) => setSh(s.key, { isDirector: e.target.checked })} />
                เป็นกรรมการ / ผู้มีอำนาจลงนาม
              </label>
              <UploadBox
                label="บัตรประชาชน"
                required
                uploadedName={s.idCardName}
                busy={uploading === `${s.key}:shareholder_id`}
                onPick={(file) => pickShFile(s, "shareholder_id", file)}
              />
              <UploadBox
                label="สำเนาทะเบียนบ้าน"
                required
                uploadedName={s.houseRegName}
                busy={uploading === `${s.key}:shareholder_house`}
                onPick={(file) => pickShFile(s, "shareholder_house", file)}
              />
            </div>
          ))}
        </section>

        <section className="card space-y-3">
          <SectionTitle>5. ผู้ติดต่อ</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อ–นามสกุล" required value={f.contact_name} onChange={(v) => set("contact_name", v)} />
            <Field label="ตำแหน่ง" value={f.contact_position} onChange={(v) => set("contact_position", v)} />
            <Field label="โทรศัพท์" required value={f.contact_phone} onChange={(v) => set("contact_phone", v)} />
            <Field label="อีเมล" required value={f.contact_email} onChange={(v) => set("contact_email", v)} />
          </div>
        </section>

        <section className="card space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              ข้าพเจ้ายินยอมให้เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลเพื่อการให้บริการทางบัญชีและภาษี
              ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 <span className="text-red-500">*</span>
            </span>
          </label>
          <label className="block">
            <span className="label">หมายเหตุเพิ่มเติม</span>
            <textarea className="input h-16" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="pb-16">
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={submit}
            disabled={busy || Boolean(uploading) || !consent}
          >
            {busy ? "กำลังส่ง…" : "ส่งข้อมูลลงทะเบียน"}
          </button>
        </div>
      </div>
    </main>
  );
}
