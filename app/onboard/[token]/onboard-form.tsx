"use client";

import { useRef, useState } from "react";
import type { FirmBranding } from "@/lib/branding";
import type { IntakeSubmission } from "@/lib/intake";
import EvidenceSheet, { type EvidenceData } from "@/components/evidence-sheet";
import {
  INTAKE_TIMELINE_NOTE,
  INTAKE_MIN_SHAREHOLDERS,
  INTAKE_MAX_SHAREHOLDERS,
} from "@/lib/intake-shared";

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

function SectionTitle({ step, done, children }: { step: string; done?: boolean; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white ${
          done ? "bg-emerald-500" : "bg-neutral-900"
        }`}
      >
        {done ? "✓" : step}
      </span>
      {children}
    </h2>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-xs text-neutral-500">{children}</p>;
}

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="label">
        {label} {required ? <span className="text-red-500">*</span> : <span className="text-neutral-400">(ไม่บังคับ)</span>}
      </span>
      <input className="input text-base sm:text-sm" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <Hint>{hint}</Hint>}
    </label>
  );
}

function UploadBox({
  label,
  required,
  hint,
  uploadedName,
  busy,
  accept,
  onPick,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  uploadedName: string;
  busy: boolean;
  accept: string;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3">
      <div className="flex items-center gap-2">
      <button type="button" className="btn shrink-0 py-2.5 text-xs sm:py-1.5" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? "กำลังอัปโหลด…" : "แนบไฟล์"}
      </button>
        <span className="text-sm">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {hint && <Hint>{hint}</Hint>}
      {uploadedName && <p className="mt-1 text-xs text-emerald-600">✓ {uploadedName}</p>}
    </div>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ref.current;
    if (!c) return;
    drawing.current = true;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current?.toDataURL("image/png") ?? "");
  }
  function clear() {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange("");
  }
  return (
    <div className="space-y-1">
      <canvas
        ref={ref}
        width={640}
        height={150}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-36 w-full touch-none rounded-lg border border-neutral-300 bg-white"
        style={{ touchAction: "none" }}
      />
      <button type="button" className="btn text-xs" onClick={clear}>
        ล้างลายมือชื่อ
      </button>
    </div>
  );
}

export default function OnboardForm({
  token,
  branding,
  initial,
  expiresAt,
}: {
  token: string;
  branding: FirmBranding;
  initial: IntakeSubmission | null;
  expiresAt: string | null;
}) {
  const [f, setF] = useState({
    name_th: initial?.name_th ?? "",
    name_en: initial?.name_en ?? "",
    company_email: initial?.company_email ?? "",
    company_phone: initial?.company_phone ?? "",
    reg_date: initial?.reg_date ?? "",
    capital_registered: initial?.capital_registered != null ? String(initial.capital_registered) : "",
    capital_paid: initial?.capital_paid != null ? String(initial.capital_paid) : "",
    business_desc: initial?.business_desc ?? "",
    contact_name: initial?.contact_name ?? "",
    contact_position: initial?.contact_position ?? "",
    contact_phone: initial?.contact_phone ?? "",
    contact_email: initial?.contact_email ?? "",
    notes: initial?.notes ?? "",
  });
  const [companyHouse, setCompanyHouse] = useState({
    path: initial?.company_house_path ?? "",
    name: initial?.company_house_path ? "แนบแล้ว" : "",
  });
  const [companyMap, setCompanyMap] = useState({
    path: initial?.company_map_path ?? "",
    name: initial?.company_map_path ? "แนบแล้ว" : "",
  });
  const [mapDesc, setMapDesc] = useState(initial?.company_map_desc ?? "");
  const [shs, setShs] = useState<Sh[]>(() => {
    if (initial?.shareholders?.length) {
      return initial.shareholders.map((s) => ({
        key: Math.random().toString(36).slice(2),
        name: s.name ?? "",
        idNo: s.idNo ?? "",
        percent: s.percent ?? "",
        isDirector: Boolean(s.isDirector),
        phone: s.phone ?? "",
        email: s.email ?? "",
        idCardPath: s.idCardPath ?? "",
        idCardName: s.idCardPath ? "แนบแล้ว" : "",
      }));
    }
    return [newSh(), newSh()];
  });
  const [consent, setConsent] = useState(Boolean(initial?.consent_at));
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const setSh = (key: string, patch: Partial<Sh>) =>
    setShs((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  function percentOf(s: Sh): number | null {
    const t = s.percent.trim().replace(/%/g, "");
    if (!t) return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }
  const shsInfoOk =
    shs.length >= INTAKE_MIN_SHAREHOLDERS &&
    shs.every((s) => s.name.trim() && s.phone.trim() && emailOk(s.email) && percentOf(s) != null);
  const shsDocsOk = shs.length >= INTAKE_MIN_SHAREHOLDERS && shs.every((s) => s.idCardPath);
  const percentSum = shs.reduce((sum, s) => sum + (percentOf(s) ?? 0), 0);
  const percentOk =
    shs.length >= INTAKE_MIN_SHAREHOLDERS &&
    shs.every((s) => percentOf(s) != null) &&
    Math.abs(percentSum - 100) < 0.01;
  const shsDone = shsInfoOk && percentOk;
  const steps = [
    { label: "ชื่อบริษัท", done: Boolean(f.name_th.trim()) },
    { label: "ติดต่อบริษัท", done: emailOk(f.company_email) && Boolean(f.company_phone.trim()) },
    { label: "ทะเบียนบ้าน", done: Boolean(companyHouse.path) },
    { label: "แผนที่", done: Boolean(companyMap.path) },
    { label: "ผู้ถือหุ้น", done: shsDone },
    { label: "บัตร ปชช.", done: shsDocsOk },
    {
      label: "ผู้ติดต่อ",
      done: Boolean(f.contact_name.trim()) && Boolean(f.contact_phone.trim()) && emailOk(f.contact_email),
    },
    {
      label: "ลงนาม",
      done: Boolean(f.contact_name.trim()) && (Boolean(signatureDataUrl) || Boolean(initial?.signature_path)) && consent,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const secDone = [
    steps[0].done && steps[1].done,
    steps[2].done && steps[3].done,
    steps[4].done && steps[5].done,
    steps[6].done && steps[7].done,
  ];
  function expiryHint(): string | null {
    const e = expiresAt ? new Date(expiresAt).getTime() : NaN;
    if (!Number.isFinite(e)) return null;
    const days = Math.ceil((e - Date.now()) / 86400000);
    if (days < 0) return null;
    if (days <= 7) return `ลิงก์นี้จะหมดอายุในอีก ${days} วัน — กรุณาส่งแบบฟอร์มก่อนหมดอายุ`;
    return null;
  }


  async function upload(kind: string, blob: Blob, fileName: string, contentType: string): Promise<string> {
    const res = await fetch(`/api/onboard/${token}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, fileName, contentType, size: blob.size }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; path?: string; error?: string };
    if (!res.ok || !data.url || !data.path) throw new Error(data.error || "แนบไฟล์ไม่สำเร็จ");
    const put = await fetch(data.url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
    if (!put.ok) throw new Error("อัปโหลดไปที่เซิร์ฟเวอร์ไม่สำเร็จ");
    return data.path;
  }

  async function pick(kind: string, file: File) {
    setUploading(kind);
    setError("");
    try {
      const path = await upload(kind, file, file.name, mimeFor(file));
      if (kind === "company_house") setCompanyHouse({ path, name: file.name });
      else if (kind === "company_map") setCompanyMap({ path, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "แนบไฟล์ไม่สำเร็จ");
    } finally {
      setUploading("");
    }
  }

  async function pickShFile(sh: Sh, file: File) {
    setUploading(`${sh.key}:id`);
    setError("");
    try {
      const path = await upload("shareholder_id", file, file.name, mimeFor(file));
      setSh(sh.key, { idCardPath: path, idCardName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "แนบไฟล์ไม่สำเร็จ");
    } finally {
      setUploading("");
    }
  }

  async function submit() {
    setError("");
    if (shs.length < INTAKE_MIN_SHAREHOLDERS) {
      setError(`กรุณากรอกข้อมูลผู้ถือหุ้นอย่างน้อย ${INTAKE_MIN_SHAREHOLDERS} ราย`);
      return;
    }
    if (!f.contact_name.trim()) {
      setError("กรุณาระบุชื่อ–นามสกุลของผู้ติดต่อ (ใช้เป็นผู้ลงนาม)");
      return;
    }
    if (!signatureDataUrl && !initial?.signature_path) {
      setError("กรุณาลงลายมือชื่อเพื่อยืนยันข้อมูล");
      return;
    }
    setBusy(true);
    try {
      let signaturePath = initial?.signature_path ?? "";
      if (signatureDataUrl) {
        const blob = await (await fetch(signatureDataUrl)).blob();
        signaturePath = await upload("signature", blob, "signature.png", "image/png");
      }
      const res = await fetch(`/api/onboard/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          company_house_path: companyHouse.path,
          company_map_path: companyMap.path,
          company_map_desc: mapDesc,
          shareholders: shs.map((s) => ({
            name: s.name,
            idNo: s.idNo,
            percent: s.percent,
            isDirector: s.isDirector,
            phone: s.phone,
            email: s.email,
            idCardPath: s.idCardPath,
          })),
          consent,
          signer_name: f.contact_name,
          signature_path: signaturePath,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ref?: string; submittedAt?: string };
      if (!res.ok) {
        setError(data.error || "ส่งแบบฟอร์มไม่สำเร็จ");
        return;
      }
      setRef(data.ref ?? null);
      setSubmittedAt(data.submittedAt ?? new Date().toISOString());
    } catch {
      setError("ส่งแบบฟอร์มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  // ---- evidence view after submit --------------------------------------
  if (ref) {
    const evidence: EvidenceData = {
      firmName: branding.firmName,
      logoDataUri: branding.logoDataUri,
      ref,
      statusLabel: "รอตรวจสอบ",
      submittedAt: submittedAt ?? new Date().toISOString(),
      nameTh: f.name_th,
      nameEn: f.name_en,
      regDate: f.reg_date,
      capitalRegistered: f.capital_registered,
      capitalPaid: f.capital_paid,
      businessDesc: f.business_desc,
      companyEmail: f.company_email,
      companyPhone: f.company_phone,
      mapDesc,
      contactName: f.contact_name,
      contactPosition: f.contact_position,
      contactPhone: f.contact_phone,
      contactEmail: f.contact_email,
      notes: f.notes,
      shareholders: shs,
      signatureSrc: signatureDataUrl || null,
      signerName: f.contact_name,
      signedAt: submittedAt,
      consentAt: consent ? submittedAt : null,
      docs: [
        companyHouse.name ? { label: "ทะเบียนบ้าน (ที่ตั้งบริษัท)" } : { label: "" },
        companyMap.name ? { label: "ภาพแผนที่ Google Maps" } : { label: "" },
        ...shs.map((s) => ({ label: `บัตรประชาชน — ${s.name || "ผู้ถือหุ้น"}` })),
      ].filter((d) => d.label),
      timelineNote: INTAKE_TIMELINE_NOTE,
    };
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ✓ ส่งข้อมูลเรียบร้อยแล้ว — เก็บหลักฐานนี้ไว้ได้เลย
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => window.print()}>
              ดาวน์โหลด PDF
            </button>
          </div>
        </div>
        <EvidenceSheet data={evidence} />
      </main>
    );
  }

  // ---- form -------------------------------------------------------------
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-4 flex items-center gap-3">
        {branding.logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoDataUri} alt={branding.firmName} className="h-9 max-w-[40%] object-contain" />
        ) : null}
        <div>
          <h1 className="text-lg font-bold">แบบฟอร์มลงทะเบียนใช้บริการ</h1>
          <p className="text-xs text-neutral-500">
            {branding.firmName} · ใช้เวลาประมาณ 3 นาที · ข้อมูลของท่านจะถูกเก็บเป็นความลับ
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <section className="card space-y-2">
          <p className="text-sm font-semibold">ก่อนเริ่ม — โปรดเตรียมเอกสาร 3 รายการ</p>
          <ol className="list-inside list-decimal space-y-0.5 text-sm text-neutral-600">
            <li>ชื่อบริษัทที่ประสงค์จะจดทะเบียน พร้อมอีเมลและหมายเลขโทรศัพท์ของบริษัท</li>
            <li>สำเนาบัตรประจำตัวประชาชนของผู้ถือหุ้นทุกท่าน (อย่างน้อย 2 ท่าน) พร้อมหมายเลขโทรศัพท์และอีเมลของแต่ละท่าน</li>
            <li>สำเนาทะเบียนบ้านของที่ตั้งสถานประกอบการ และภาพแผนที่จาก Google Maps</li>
          </ol>
          {expiryHint() && (
            <p className="rounded bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700">
              ⏳ {expiryHint()}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-medium text-neutral-500">
              กรอกแล้ว {doneCount}/{steps.length}
            </span>
          </div>
          <p className="rounded bg-neutral-50 px-2 py-1.5 text-xs text-neutral-500">{INTAKE_TIMELINE_NOTE}</p>
        </section>

        <section className="card space-y-3">
          <SectionTitle step="1" done={secDone[0]}>ส่วนที่ 1 — ข้อมูลนิติบุคคล</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อบริษัท (ภาษาไทย)" required value={f.name_th} onChange={(v) => set("name_th", v)} placeholder="บริษัท ตัวอย่าง จำกัด" />
            <Field label="ชื่อบริษัท (ภาษาอังกฤษ)" value={f.name_en} onChange={(v) => set("name_en", v)} placeholder="EXAMPLE CO., LTD." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="อีเมลของบริษัท" required value={f.company_email} onChange={(v) => set("company_email", v)} placeholder="info@company.co.th" />
            <Field label="หมายเลขโทรศัพท์ของบริษัท" required value={f.company_phone} onChange={(v) => set("company_phone", v)} placeholder="02-000-0000" />
          </div>
          <details className="rounded-lg border border-neutral-200 p-3">
            <summary className="cursor-pointer text-xs text-neutral-500">ข้อมูลเพิ่มเติม (ถ้าทราบ)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field label="วันที่จดทะเบียน" type="date" value={f.reg_date} onChange={(v) => set("reg_date", v)} />
              <Field label="ทุนจดทะเบียน" value={f.capital_registered} onChange={(v) => set("capital_registered", v)} placeholder="เช่น 1000000" />
              <Field label="ทุนชำระแล้ว" value={f.capital_paid} onChange={(v) => set("capital_paid", v)} />
            </div>
            <div className="mt-3">
              <Field
                label="ประเภทธุรกิจ / วัตถุประสงค์"
                value={f.business_desc}
                onChange={(v) => set("business_desc", v)}
                placeholder="เช่น ขายของออนไลน์"
              />
            </div>
          </details>
        </section>

        <section className="card space-y-3">
          <SectionTitle step="2" done={secDone[1]}>ส่วนที่ 2 — ที่ตั้งสถานประกอบการ</SectionTitle>
          <p className="text-xs text-neutral-500">แนบเอกสารให้ครบก็พอ — ไม่ต้องพิมพ์ที่อยู่ · รับ JPG/PNG/WebP/PDF ไม่เกิน 10MB</p>
          <UploadBox
            label="สำเนาทะเบียนบ้าน (ที่ตั้งบริษัท)"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
            uploadedName={companyHouse.name}
            busy={uploading === "company_house"}
            onPick={(file) => pick("company_house", file)}
          />
          <UploadBox
            label="ภาพแผนที่ Google Maps"
            required
            hint="เปิด Maps ขยายให้เห็นอาคารและซอย แล้วแคปหน้าจอ"
            accept="image/jpeg,image/png,image/webp"
            uploadedName={companyMap.name}
            busy={uploading === "company_map"}
            onPick={(file) => pick("company_map", file)}
          />
          <label className="block">
            <span className="label">
              คำอธิบายเส้นทางโดยสังเขป <span className="text-neutral-400">(ไม่บังคับ)</span>
            </span>
            <textarea className="input text-base sm:text-sm" rows={3} maxLength={500} value={mapDesc} onChange={(e) => setMapDesc(e.target.value)} placeholder="เช่น เข้าซอยสุขุมวิท 24 ตึกสีขาวชั้น 3 ใกล้ BTS พร้อมพงษ์" />
          </label>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle step="3" done={secDone[2]}>
              ข้อมูลผู้ถือหุ้นและกรรมการ <span className="text-xs font-normal text-neutral-400">({shs.length}/{INTAKE_MAX_SHAREHOLDERS})</span>
            </SectionTitle>            {shs.length < INTAKE_MAX_SHAREHOLDERS && (
              <button type="button" className="btn text-xs" onClick={() => setShs((p) => [...p, newSh()])}>
                + เพิ่มรายชื่อ
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-500">ใช้ยืนยันตัวตน DBD (อย่างน้อย {INTAKE_MIN_SHAREHOLDERS} ท่าน)</p>
          {shs.map((s, i) => (
            <div key={s.key} className="space-y-3 rounded-lg border border-neutral-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">ผู้ถือหุ้น #{i + 1}</span>
                {shs.length > INTAKE_MIN_SHAREHOLDERS && (
                  <button type="button" className="text-xs text-neutral-400 hover:text-red-600" onClick={() => setShs((p) => p.filter((x) => x.key !== s.key))}>
                    ลบ
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ชื่อ–นามสกุล" required value={s.name} onChange={(v) => setSh(s.key, { name: v })} />
                <Field label="เลขบัตรประชาชน" value={s.idNo} onChange={(v) => setSh(s.key, { idNo: v })} />
                <Field label="โทรศัพท์" required value={s.phone} onChange={(v) => setSh(s.key, { phone: v })} hint="DBD ส่งรหัสยืนยันไปเบอร์นี้" />
                <Field label="อีเมล" required value={s.email} onChange={(v) => setSh(s.key, { email: v })} />
                <Field label="สัดส่วนหุ้น (%)" required value={s.percent} onChange={(v) => setSh(s.key, { percent: v })} hint="รวมทุกคนต้องเป็น 100%" />
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={s.isDirector} onChange={(e) => setSh(s.key, { isDirector: e.target.checked })} />
                เป็นกรรมการ / ผู้มีอำนาจลงนามแทนนิติบุคคล
              </label>
              <UploadBox
                label="บัตรประชาชน"
                required
                accept="image/jpeg,image/png,image/webp,application/pdf"
                uploadedName={s.idCardName}
                busy={uploading === `${s.key}:id`}
                onPick={(file) => pickShFile(s, file)}
              />
            </div>
          ))}
          <p className={`text-xs font-medium ${percentOk ? "text-emerald-600" : "text-neutral-500"}`}>
            {percentOk
              ? "✓ สัดส่วนหุ้นรวม 100% ถูกต้อง"
              : `สัดส่วนหุ้นรวม ${percentSum.toFixed(2).replace(/\.?0+$/, "")}% — ต้องรวมเป็น 100%`}
          </p>
        </section>

        <section className="card space-y-3">
          <SectionTitle step="4" done={secDone[3]}>ส่วนที่ 4 — ผู้ติดต่อและลายมือชื่อ</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อ–นามสกุล ผู้ติดต่อ" required value={f.contact_name} onChange={(v) => set("contact_name", v)} hint="คนที่เราประสานงานได้จริง" />
            <Field label="ตำแหน่ง" value={f.contact_position} onChange={(v) => set("contact_position", v)} />
            <Field label="โทรศัพท์" required value={f.contact_phone} onChange={(v) => set("contact_phone", v)} />
            <Field label="อีเมล" required value={f.contact_email} onChange={(v) => set("contact_email", v)} />
          </div>
          <div>
            <span className="label">ลายมือชื่อยืนยัน <span className="text-red-500">*</span></span>
            <Hint>
              กรุณาลงลายมือชื่อในกรอบโดยใช้นิ้วหรือเมาส์ · ผู้ลงนามคือ “{f.contact_name || "ผู้ติดต่อที่กรอกด้านบน"}”
            </Hint>
            {initial?.signature_path && !signatureDataUrl && (
              <p className="mt-1 text-xs text-emerald-600">✓ มีลายเซ็นที่บันทึกไว้แล้ว (วาดใหม่ได้หากต้องการแก้ไข)</p>
            )}
            <SignaturePad onChange={setSignatureDataUrl} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              ข้าพเจ้ายินยอมให้เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลเพื่อการให้บริการทางบัญชีและภาษี
              ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 <span className="text-red-500">*</span>
            </span>
          </label>
          <label className="block">
            <span className="label">
              หมายเหตุเพิ่มเติม <span className="text-neutral-400">(ไม่บังคับ)</span>
            </span>
            <textarea className="input h-16 text-base sm:text-sm" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
        </section>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-neutral-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <span className={`text-xs font-medium ${allDone ? "text-emerald-600" : "text-neutral-500"}`}>
            {allDone ? "พร้อมส่งแบบฟอร์ม ✓" : `ยังขาดอีก ${steps.length - doneCount} รายการ`}
          </span>
          <button
            type="button"
            className="btn-primary flex-1 py-3 sm:flex-none sm:py-1.5"
            onClick={submit}
            disabled={busy || Boolean(uploading) || !consent}
          >
            {busy ? "กำลังส่งแบบฟอร์ม…" : "ส่งแบบฟอร์มลงทะเบียน"}
          </button>
        </div>
      </div>
    </main>
  );
}
