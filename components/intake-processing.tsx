"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EvidenceSheet, { type EvidenceData } from "@/components/evidence-sheet";
import CopyButton from "@/components/copy-button";
import {
  approveForFiling,
  createBookkeepingClient,
  rejectIntakeSubmission,
  updateIntakeSubmission,
  updateIssuedTaxId,
  type IntakeReviewPatch,
} from "@/lib/actions/intake";

const FILINGS = ["ภ.พ.30", "ภ.ง.ด.1", "ภ.ง.ด.3", "ภ.ง.ด.53", "ภ.ง.ด.50/51", "ประกันสังคม"];

const STATUS_LABEL: Record<string, string> = {
  submitted: "รอตรวจสอบ",
  approved: "ยื่นจดทะเบียนแล้ว",
  rejected: "ปฏิเสธ",
};

export default function IntakeProcessing({
  id,
  evidence,
  status,
  clientId,
  clientName,
  linkLabel,
  issuedTaxId,
  defaults,
}: {
  id: string;
  evidence: EvidenceData;
  status: "submitted" | "approved" | "rejected";
  clientId: string | null;
  clientName: string | null;
  linkLabel: string | null;
  issuedTaxId: string | null;
  defaults: IntakeReviewPatch;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"data" | "review">("data");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [taxId, setTaxId] = useState(issuedTaxId ?? "");
  const [r, setR] = useState<IntakeReviewPatch>({
    address: defaults.address ?? "",
    vat_registered: defaults.vat_registered ?? null,
    vat_reg_date: defaults.vat_reg_date ?? "",
    vat_place: defaults.vat_place ?? "",
    fiscal_year_end: defaults.fiscal_year_end ?? "",
    filings: defaults.filings ?? [],
  });

  const editable = status === "submitted";
  const filed = status === "approved";
  // Prospect rows (filed, no bookkeeping client yet) can still be edited and
  // converted — only converted-with-client and rejected rows lock.
  const canEdit = editable || (filed && !clientId);
  const canConvert = filed && !clientId;
  const checks = [
    { label: "ชื่อบริษัท", ok: Boolean(evidence.nameTh) },
    { label: "ที่อยู่จดทะเบียน", ok: Boolean((r.address ?? "").trim()) },
    { label: "ผู้ถือหุ้น ≥2", ok: evidence.shareholders.length >= 2 },
    { label: "เอกสาร", ok: evidence.docs.length >= 3 },
    { label: "ลายเซ็น", ok: Boolean(evidence.signatureSrc) },
  ];
  const readyToFile = checks[0].ok && checks[1].ok && checks[2].ok && checks[4].ok;

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fn();
      if (!res.ok) {
        setMessage(res.error);
        return false;
      }
      setMessage(okMsg);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    await run(() => updateIntakeSubmission(id, r), "บันทึกข้อมูลที่กรอกเพิ่มแล้ว");
  }
  async function approve() {
    const ok = await run(() => approveForFiling(id, r), "อนุมัติเพื่อยื่นจดทะเบียนแล้ว");
    if (ok) router.refresh();
  }
  async function saveTaxId() {
    await run(() => updateIssuedTaxId(id, taxId), "บันทึกเลขทะเบียนที่ออกแล้ว");
  }
  async function convert() {
    if (!confirm("สร้างลูกค้าบัญชีจากคำขอนี้? (เฉพาะเมื่อบริษัทว่าจ้างทำบัญชี)")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await createBookkeepingClient(id);
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      router.push(`/clients/${res.clientId}`);
    } finally {
      setBusy(false);
    }
  }
  async function reject() {
    if (!confirm("ปฏิเสธคำขอนี้?")) return;
    await run(() => rejectIntakeSubmission(id), "ปฏิเสธคำขอแล้ว");
  }

  const quickCopies: { label: string; value: string }[] = [
    { label: "ชื่อไทย", value: evidence.nameTh },
    ...(evidence.nameEn ? [{ label: "ชื่ออังกฤษ", value: evidence.nameEn }] : []),
    ...((r.address ?? "").trim() ? [{ label: "ที่อยู่", value: r.address as string }] : []),
    { label: "อีเมลบริษัท", value: evidence.companyEmail ?? "" },
    { label: "โทรบริษัท", value: evidence.companyPhone ?? "" },
  ].filter((x) => x.value);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/onboarding" className="text-sm text-neutral-500 hover:underline">
          ← จดทะเบียนบริษัท
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">
            {clientId ? "ลูกค้าบัญชีแล้ว" : filed ? "ยื่นจดทะเบียนแล้ว" : STATUS_LABEL[status]}
            {filed && !clientId && !issuedTaxId ? " · รอเลขทะเบียน" : ""}
          </span>
          {linkLabel && <span className="text-neutral-400">ลิงก์: {linkLabel}</span>}
        </div>
      </div>

      <section className="card space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {checks.map((c) => (
            <span key={c.label} className={c.ok ? "text-emerald-600" : "text-neutral-400"}>
              {c.ok ? "✓" : "○"} {c.label}
            </span>
          ))}
        </div>
        {quickCopies.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
            <span className="text-neutral-400">คัดลอกด่วน:</span>
            {quickCopies.map((c) => (
              <span key={c.label} className="inline-flex max-w-full items-center">
                <span className="truncate">{c.label}</span>
                <CopyButton text={c.value} />
              </span>
            ))}
          </div>
        )}
        {filed && (
          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
            <span className="text-xs text-neutral-500">เลขทะเบียนที่ออก (กรอกหลัง DBD อนุมัติ):</span>
            <input
              className="input w-52 font-mono text-xs"
              value={taxId}
              disabled={!canEdit && !filed}
              placeholder="0-0000-00000-00-0"
              onChange={(e) => setTaxId(e.target.value)}
            />
            <button className="btn text-xs" onClick={saveTaxId} disabled={busy}>
              บันทึกเลขทะเบียน
            </button>
          </div>
        )}
        {clientId && clientName && (
          <p className="text-xs">
            ลูกค้าบัญชี:{" "}
            <Link href={`/clients/${clientId}`} className="text-blue-600 hover:underline">
              {clientName} →
            </Link>
          </p>
        )}
        {message && <p className="text-xs text-neutral-600">{message}</p>}
      </section>

      <div className="flex gap-1.5 print:hidden">
        <button
          type="button"
          onClick={() => setTab("data")}
          className={tab === "data" ? "rounded-full bg-neutral-900 px-3 py-1 text-xs text-white" : "rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600"}
        >
          ข้อมูลที่ส่ง
        </button>
        <button
          type="button"
          onClick={() => setTab("review")}
          className={tab === "review" ? "rounded-full bg-neutral-900 px-3 py-1 text-xs text-white" : "rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600"}
        >
          ตรวจ/แก้ก่อนยื่นจด
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600"
        >
          พิมพ์ / บันทึกเป็น PDF
        </button>
      </div>

      {tab === "data" ? (
        <EvidenceSheet data={evidence} />
      ) : (
        <section className="card space-y-4 print:hidden">
          <p className="text-xs text-neutral-500">
            กรอกเพิ่มเพื่อใช้จดทะเบียน — ข้อมูลจะถูกใช้ตอนอนุมัติ (ไม่กระทบข้อมูลที่ผู้สนใจส่งมา)
          </p>
          <label className="block">
            <span className="label">ที่อยู่จดทะเบียน (พิมพ์จากทะเบียนบ้าน)</span>
            <textarea
              className="input"
              rows={2}
              value={r.address ?? ""}
              disabled={!canEdit}
              onChange={(e) => setR((p) => ({ ...p, address: e.target.value }))}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label">VAT</span>
              <select
                className="input"
                disabled={!canEdit}
                value={r.vat_registered == null ? "" : r.vat_registered ? "yes" : "no"}
                onChange={(e) =>
                  setR((p) => ({ ...p, vat_registered: e.target.value === "" ? null : e.target.value === "yes" }))
                }
              >
                <option value="">ไม่ทราบ</option>
                <option value="yes">จด</option>
                <option value="no">ไม่จด</option>
              </select>
            </label>
            <label className="block">
              <span className="label">วันจด VAT</span>
              <input
                type="date"
                className="input"
                disabled={!canEdit}
                value={r.vat_reg_date ?? ""}
                onChange={(e) => setR((p) => ({ ...p, vat_reg_date: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="label">วันสิ้นสุดรอบบัญชี</span>
              <input
                className="input"
                disabled={!canEdit}
                value={r.fiscal_year_end ?? ""}
                onChange={(e) => setR((p) => ({ ...p, fiscal_year_end: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="label">สถานที่ประกอบการ VAT</span>
            <input
              className="input"
              disabled={!canEdit}
              value={r.vat_place ?? ""}
              onChange={(e) => setR((p) => ({ ...p, vat_place: e.target.value }))}
            />
          </label>
          <div>
            <span className="label">แบบที่ต้องยื่น</span>
            <div className="flex flex-wrap gap-3 text-sm">
              {FILINGS.map((code) => {
                const sel = (r.filings ?? []).includes(code);
                return (
                  <label key={code} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={sel}
                      onChange={(e) => {
                        const cur = new Set(r.filings ?? []);
                        if (e.target.checked) cur.add(code);
                        else cur.delete(code);
                        setR((p) => ({ ...p, filings: [...cur] }));
                      }}
                    />
                    {code}
                  </label>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {(editable || canConvert) && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {editable && (
            <>
              <button className="btn" onClick={save} disabled={busy}>
                บันทึกที่กรอกเพิ่ม
              </button>
              <button
                className="btn-primary"
                onClick={approve}
                disabled={busy || !readyToFile}
                title={readyToFile ? "" : "ต้องมีชื่อ + ที่อยู่ + ผู้ถือหุ้น ≥2 + ลายเซ็น ก่อนอนุมัติ"}
              >
                อนุมัติเพื่อยื่นจดทะเบียน
              </button>
              <button className="btn-danger" onClick={reject} disabled={busy}>
                ปฏิเสธ
              </button>
            </>
          )}
          {canConvert && (
            <button className="btn-primary" onClick={convert} disabled={busy}>
              สร้างเป็นลูกค้าบัญชี
            </button>
          )}
        </div>
      )}
    </div>
  );
}
