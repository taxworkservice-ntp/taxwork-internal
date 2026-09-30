"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listClients, type Client } from "@/lib/actions/clients";
import { listContacts, type Contact } from "@/lib/actions/contacts";
import { useClientFavorites } from "@/lib/use-client-favorites";
import EntityPicker, { type EntityItem } from "@/components/entity-picker";
import {
  WHT_CHECKMARK_POS,
  WHT_DESCRIPTION_PRESETS,
  WHT_DESCRIPTION_RATE_MAP,
  WHT_FORM_TYPES,
  WHT_FORM_TYPE_LABELS,
  WHT_PAGE_H,
  WHT_PAGE_W,
  WHT_SIGNATURE_BOX,
  WHT_STAMP_BOX,
  buildWhtOverlay,
  calcWht,
  checkTaxId,
  fmtNum,
  maskTaxIdInput,
  parseAmount,
  taxIdDigits,
  validateWhtForm,
  whtAmountThaiText,
  type WhtFormType,
  type WhtFormValues,
} from "@/lib/wht/fields";

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fieldError(
  errors: { field: string; message: string }[],
  field: string
): string | null {
  return errors.find((e) => e.field === field)?.message ?? null;
}

async function fileToDataUri(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  const mime = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${b64}`;
}

function WhtPreview({
  values,
  signature,
  stamp,
  showSig,
  showStamp,
}: {
  values: WhtFormValues;
  signature: string | null;
  stamp: string | null;
  showSig: boolean;
  showStamp: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / WHT_PAGE_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fields = useMemo(() => buildWhtOverlay(values), [values]);
  const check = WHT_CHECKMARK_POS[values.formType];

  return (
    <div ref={wrapRef} className="w-full overflow-hidden rounded border border-neutral-200 bg-neutral-100">
      <div
        style={{
          width: WHT_PAGE_W * scale,
          height: WHT_PAGE_H * scale,
        }}
        className="relative"
      >
        <div
          className="absolute left-0 top-0 origin-top-left bg-white"
          style={{
            width: WHT_PAGE_W,
            height: WHT_PAGE_H,
            transform: `scale(${scale})`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/wht/form_page_final.png"
            alt="แบบฟอร์มหนังสือรับรองการหักภาษี ณ ที่จ่าย"
            style={{
              position: "absolute",
              inset: 0,
              width: WHT_PAGE_W,
              height: WHT_PAGE_H,
            }}
            draggable={false}
          />
          {showSig && signature && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signature}
              alt="ลายเซ็น"
              style={{
                position: "absolute",
                top: WHT_SIGNATURE_BOX.top,
                left: WHT_SIGNATURE_BOX.left,
                width: WHT_SIGNATURE_BOX.width,
                height: WHT_SIGNATURE_BOX.height,
                objectFit: "contain",
              }}
              draggable={false}
            />
          )}
          {showStamp && stamp && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stamp}
              alt="ตราประทับ"
              style={{
                position: "absolute",
                top: WHT_STAMP_BOX.top,
                left: WHT_STAMP_BOX.left,
                width: WHT_STAMP_BOX.width,
                height: WHT_STAMP_BOX.height,
                objectFit: "contain",
              }}
              draggable={false}
            />
          )}
          <svg
            style={{
              position: "absolute",
              top: check.top - check.fs + 3,
              left: check.left,
              width: check.fs,
              height: check.fs,
            }}
            viewBox="0 0 32 32"
            fill="none"
            stroke="#000"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M 6 17 C 6 17, 10 23, 13 25 C 16 19, 22 12, 27 7" />
          </svg>
          {fields.map((f) => (
            <div
              key={f.name}
              style={{
                position: "absolute",
                top: f.top,
                left: f.left,
                fontSize: f.fontSize,
                fontWeight: f.bold ? 700 : 400,
                lineHeight: 1.35,
                whiteSpace: f.wrap ? "normal" : "pre",
                wordBreak: f.wrap ? "break-word" : "normal",
                color: "#000",
                fontFamily: "'Cordia New','Sarabun',sans-serif",
                ...(f.width ? { width: f.width } : {}),
                ...(f.rightAlign ? { textAlign: "right" as const } : {}),
              }}
            >
              {f.value}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WhtPage() {
  const [values, setValues] = useState<WhtFormValues>(() => ({
    formType: "pnd3",
    certificateNo: "",
    payerName: "",
    payerTaxId: "",
    payerAddress: "",
    payeeName: "",
    payeeTaxId: "",
    payeeAddress: "",
    description: WHT_DESCRIPTION_PRESETS[0],
    issueDate: todayIso(),
    signDate: todayIso(),
    amount: "",
    whtRate: "3",
  }));
  const [descMode, setDescMode] = useState<"preset" | "custom">("preset");
  const [signature, setSignature] = useState<string | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [sigText, setSigText] = useState("");
  const [typedSig, setTypedSig] = useState<string | null>(null);
  const sigTextRef = useRef("");
  sigTextRef.current = sigText;
  const [showSig, setShowSig] = useState(true);
  const [showStamp, setShowStamp] = useState(true);
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Payer/payee pickers: pull name/tax ID/address from the clients and
  // contacts databases. Favorites reuse the shared clients.favorites store
  // (same stars as the Clients page).
  const CONTACT_TYPE_LABELS: Record<Contact["type"], string> = {
    auditor: "ผู้สอบบัญชี",
    accountant: "นักบัญชี",
    both: "ผู้สอบบัญชี + นักบัญชี",
  };

  const { favorites, toggleFav } = useClientFavorites();
  const [dbClients, setDbClients] = useState<Client[]>([]);
  const [dbContacts, setDbContacts] = useState<Contact[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [payerSel, setPayerSel] = useState("");
  const [payeeSel, setPayeeSel] = useState("");
  const [pickerResetKey, setPickerResetKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listClients(), listContacts()])
      .then(([clients, contacts]) => {
        if (cancelled) return;
        setDbClients(clients.filter((c) => c.status === "active"));
        setDbContacts(
          [...contacts].sort((a, b) => a.name.localeCompare(b.name, "th"))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setDbClients([]);
        setDbContacts([]);
      })
      .finally(() => {
        if (!cancelled) setDbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const payerItems: EntityItem[] = useMemo(
    () =>
      dbClients.map((c) => ({
        key: `client:${c.id}`,
        rawId: c.id,
        kind: "client" as const,
        name: c.name,
        detail: null,
        taxId: c.tax_id,
      })),
    [dbClients]
  );

  const payeeItems: EntityItem[] = useMemo(
    () => [
      ...dbClients.map((c) => ({
        key: `client:${c.id}`,
        rawId: c.id,
        kind: "client" as const,
        name: c.name,
        detail: null,
        taxId: c.tax_id,
      })),
      ...dbContacts.map((c) => ({
        key: `contact:${c.id}`,
        rawId: c.id,
        kind: "contact" as const,
        name: c.name,
        detail: [c.firm, CONTACT_TYPE_LABELS[c.type]].filter(Boolean).join(" · ") || null,
        taxId: c.tax_id,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dbClients, dbContacts]
  );

  function clearPayerErrors() {
    setErrors((prev) =>
      prev.filter(
        (e) => e.field !== "payerName" && e.field !== "payerTaxId" && e.field !== "payerAddress"
      )
    );
  }

  function clearPayeeErrors() {
    setErrors((prev) =>
      prev.filter(
        (e) => e.field !== "payeeName" && e.field !== "payeeTaxId" && e.field !== "payeeAddress"
      )
    );
  }

  function fillPayerFromClient(c: Client) {
    setValues((prev) => ({
      ...prev,
      payerName: c.name ?? "",
      payerTaxId: c.tax_id ? maskTaxIdInput(c.tax_id) : prev.payerTaxId,
      payerAddress: c.address ?? prev.payerAddress,
    }));
    clearPayerErrors();
  }

  function fillPayeeFromClient(c: Client) {
    setValues((prev) => ({
      ...prev,
      payeeName: c.name ?? "",
      payeeTaxId: c.tax_id ? maskTaxIdInput(c.tax_id) : prev.payeeTaxId,
      payeeAddress: c.address ?? prev.payeeAddress,
    }));
    clearPayeeErrors();
  }

  function pickPayer(item: EntityItem) {
    const c = dbClients.find((x) => x.id === item.rawId);
    if (!c) return;
    setPayerSel(item.key);
    fillPayerFromClient(c);
  }

  function pickPayee(item: EntityItem) {
    setPayeeSel(item.key);
    if (item.kind === "client") {
      const c = dbClients.find((x) => x.id === item.rawId);
      if (!c) return;
      fillPayeeFromClient(c);
    } else {
      const c = dbContacts.find((x) => x.id === item.rawId);
      if (!c) return;
      setValues((prev) => ({
        ...prev,
        payeeName: c.name ?? "",
        payeeTaxId: c.tax_id ? maskTaxIdInput(c.tax_id) : prev.payeeTaxId,
        payeeAddress: c.address ?? prev.payeeAddress,
      }));
      clearPayeeErrors();
    }
  }

  const set = (k: keyof WhtFormValues, v: string | WhtFormType) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const wht = calcWht(values.amount, values.whtRate);
  const thaiText = whtAmountThaiText(wht);

  function pickPreset(preset: string) {
    if (preset === "__custom") {
      setDescMode("custom");
      return;
    }
    setDescMode("preset");
    const rate = WHT_DESCRIPTION_RATE_MAP[preset];
    setValues((prev) => ({
      ...prev,
      description: preset,
      ...(rate ? { whtRate: rate } : {}),
    }));
  }

  // Typed signature: rendered to a PNG on canvas so it flows through the
  // exact same image pipeline (preview + server PDF) as an upload.
  function renderTypedSignature(text: string): string | null {
    const t = text.trim();
    if (!t) return null;
    const W = 516;
    const H = 194;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const family = `"Cordia New","Sarabun",sans-serif`;
    ctx.fillStyle = "#1e3a8c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 120;
    while (size > 28) {
      ctx.font = `700 ${size}px ${family}`;
      if (ctx.measureText(t).width <= W - 36) break;
      size -= 4;
    }
    ctx.font = `700 ${size}px ${family}`;
    ctx.fillText(t, W / 2, H / 2 + 4);
    return canvas.toDataURL("image/png");
  }

  useEffect(() => {
    setTypedSig(renderTypedSignature(sigText));
     
  }, [sigText]);

  // Re-render once the Cordia webfont arrives so canvas uses the right metrics.
  useEffect(() => {
    let live = true;
    const p = document.fonts?.ready;
    if (p) {
      p.then(() => {
        if (live) setTypedSig(renderTypedSignature(sigTextRef.current));
      }).catch(() => {
        /* keep fallback rendering */
      });
    }
    return () => {
      live = false;
    };
     
  }, []);

  // Image priority: an uploaded image always wins over typed text.
  const effectiveSignature = signature ?? typedSig;

  async function onImage(
    file: File | undefined,
    kind: "signature" | "stamp"
  ) {
    setSubmitMsg(null);
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setSubmitMsg("ไฟล์ลายเซ็น/ตราต้องเป็น PNG หรือ JPG");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setSubmitMsg("ไฟล์ใหญ่เกินไป (สูงสุด 4 MB)");
      return;
    }
    const uri = await fileToDataUri(file);
    if (kind === "signature") setSignature(uri);
    else setStamp(uri);
  }

  async function download() {
    setSubmitMsg(null);
    const problems = validateWhtForm(values);
    setErrors(problems);
    if (problems.length) {
      setSubmitMsg(`กรุณาตรวจสอบ ${problems.length} จุดที่ยังไม่ถูกต้อง`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wht/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          // Sign date always follows the payment date (single date field).
          signDate: values.issueDate,
          signatureDataUri: showSig ? effectiveSignature : null,
          stampDataUri: showStamp ? stamp : null,
          hideSignature: !showSig,
          hideStamp: !showStamp,
        }),
      });
      if (!res.ok) {
        let msg = `สร้าง PDF ไม่สำเร็จ (HTTP ${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* keep default */
        }
        setSubmitMsg(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fileStamp = values.issueDate || todayIso();
      a.href = url;
      a.download = `wht-${values.formType}-${fileStamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setSubmitMsg("ดาวน์โหลด PDF แล้ว");
    } catch {
      setSubmitMsg("สร้าง PDF ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  const payerCheck = values.payerTaxId.trim()
    ? checkTaxId(values.payerTaxId)
    : null;
  const payeeCheck = values.payeeTaxId.trim()
    ? checkTaxId(values.payeeTaxId)
    : null;

  return (
    <>
      <style>{`@font-face{font-family:'Cordia New';font-style:normal;font-weight:400;src:url('/fonts/cordia-new-regular.ttf') format('truetype');}@font-face{font-family:'Cordia New';font-style:normal;font-weight:700;src:url('/fonts/cordia-new-bold.ttf') format('truetype');}`}</style>
      <h1 className="mb-1 text-lg font-semibold">หัก ณ ที่จ่าย</h1>
      <p className="mb-6 text-xs text-neutral-500">
        กรอกข้อมูลบนแบบฟอร์มหนังสือรับรองการหักภาษี ณ ที่จ่าย แล้วดาวน์โหลด PDF — ข้อมูลไม่ถูกบันทึก
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <section className="card">
            <h2 className="mb-3 font-medium">แบบฟอร์ม</h2>
            <div className="flex flex-wrap gap-2">
              {WHT_FORM_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("formType", t)}
                  aria-pressed={values.formType === t}
                  className={
                    values.formType === t
                      ? "btn-primary"
                      : "btn"
                  }
                >
                  {WHT_FORM_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <label className="label" htmlFor="wht-cert">เลขที่ใบรับรอง (ถ้ามี)</label>
              <input
                id="wht-cert"
                className="input"
                placeholder="เช่น WT6908001"
                value={values.certificateNo}
                onChange={(e) => set("certificateNo", e.target.value)}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 font-medium">ผู้จ่ายเงิน</h2>
            <EntityPicker
              id="wht-payer-search"
              title="ค้นหาจากฐานข้อมูลลูกค้า"
              meta={dbLoading ? "(กำลังโหลด…)" : `(${dbClients.length} ราย)`}
              placeholder="พิมพ์ชื่อลูกค้า…"
              items={payerItems}
              loading={dbLoading}
              favorites={favorites}
              onToggleFav={toggleFav}
              selectedKey={payerSel}
              onPick={pickPayer}
              onClearSelection={() => setPayerSel("")}
              resetKey={pickerResetKey}
              emptyText="ไม่พบลูกค้าที่ตรง — พิมพ์เองในช่องด้านล่างได้เลย"
              footText="เลือกแล้วแก้ต่อได้ — ดาวซิงก์กับหน้ารายชื่อลูกค้า"
            />
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="wht-payer-name">ชื่อผู้จ่าย *</label>
                <input
                  id="wht-payer-name"
                  className="input"
                  value={values.payerName}
                  onChange={(e) => set("payerName", e.target.value)}
                />
                {fieldError(errors, "payerName") && (
                  <p className="mt-1 text-xs text-red-600">{fieldError(errors, "payerName")}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="wht-payer-tax">เลขผู้เสียภาษีผู้จ่าย (13 หลัก) *</label>
                <input
                  id="wht-payer-tax"
                  className="input font-mono"
                  inputMode="numeric"
                  value={values.payerTaxId}
                  onChange={(e) => set("payerTaxId", maskTaxIdInput(e.target.value))}
                />
                {payerCheck && !payerCheck.ok && taxIdDigits(values.payerTaxId).length === 13 && (
                  <p className="mt-1 text-xs text-amber-600">คำเตือน: {payerCheck.reason} — ตรวจสอบอีกครั้ง</p>
                )}
                {fieldError(errors, "payerTaxId") && (
                  <p className="mt-1 text-xs text-red-600">{fieldError(errors, "payerTaxId")}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="wht-payer-addr">ที่อยู่ผู้จ่าย *</label>
                <textarea
                  id="wht-payer-addr"
                  className="input min-h-16"
                  value={values.payerAddress}
                  onChange={(e) => set("payerAddress", e.target.value)}
                />
                {fieldError(errors, "payerAddress") && (
                  <p className="mt-1 text-xs text-red-600">{fieldError(errors, "payerAddress")}</p>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 font-medium">ผู้รับเงิน</h2>
            <EntityPicker
              id="wht-payee-search"
              title="ค้นหาจากฐานข้อมูลลูกค้าและผู้เกี่ยวข้อง"
              meta={dbLoading ? "(กำลังโหลด…)" : `(${payeeItems.length} รายการ)`}
              placeholder="พิมพ์ชื่อลูกค้าหรือผู้เกี่ยวข้อง…"
              items={payeeItems}
              loading={dbLoading}
              favorites={favorites}
              onToggleFav={toggleFav}
              selectedKey={payeeSel}
              onPick={pickPayee}
              onClearSelection={() => setPayeeSel("")}
              resetKey={pickerResetKey}
              emptyText="ไม่พบที่ตรง — พิมพ์เองในช่องด้านล่างได้เลย"
              footText="เลือกแล้วแก้ต่อได้ — ดาวซิงก์กับหน้ารายชื่อลูกค้า"
            />
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="wht-payee-name">ชื่อผู้รับ *</label>
                <input
                  id="wht-payee-name"
                  className="input"
                  value={values.payeeName}
                  onChange={(e) => set("payeeName", e.target.value)}
                />
                {fieldError(errors, "payeeName") && (
                  <p className="mt-1 text-xs text-red-600">{fieldError(errors, "payeeName")}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="wht-payee-tax">เลขผู้เสียภาษีผู้รับ (13 หลัก) *</label>
                <input
                  id="wht-payee-tax"
                  className="input font-mono"
                  inputMode="numeric"
                  value={values.payeeTaxId}
                  onChange={(e) => set("payeeTaxId", maskTaxIdInput(e.target.value))}
                />
                {payeeCheck && !payeeCheck.ok && taxIdDigits(values.payeeTaxId).length === 13 && (
                  <p className="mt-1 text-xs text-amber-600">คำเตือน: {payeeCheck.reason} — ตรวจสอบอีกครั้ง</p>
                )}
                {fieldError(errors, "payeeTaxId") && (
                  <p className="mt-1 text-xs text-red-600">{fieldError(errors, "payeeTaxId")}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="wht-payee-addr">ที่อยู่ผู้รับ *</label>
                <textarea
                  id="wht-payee-addr"
                  className="input min-h-16"
                  value={values.payeeAddress}
                  onChange={(e) => set("payeeAddress", e.target.value)}
                />
                {fieldError(errors, "payeeAddress") && (
                  <p className="mt-1 text-xs text-red-600">{fieldError(errors, "payeeAddress")}</p>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 font-medium">รายการ</h2>
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="wht-desc-preset">รายการ</label>
                <select
                  id="wht-desc-preset"
                  className="input mb-2"
                  value={descMode === "custom" ? "__custom" : values.description}
                  onChange={(e) => pickPreset(e.target.value)}
                >
                  {WHT_DESCRIPTION_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p} ({WHT_DESCRIPTION_RATE_MAP[p]}%)
                    </option>
                  ))}
                  <option value="__custom">กำหนดเอง…</option>
                </select>
                {descMode === "custom" && (
                  <input
                    className="input"
                    placeholder="พิมพ์รายการเอง"
                    value={values.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                )}
                {fieldError(errors, "description") && (
                  <p className="mt-1 text-xs text-red-600">{fieldError(errors, "description")}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="wht-issue">วันที่จ่าย * (ใช้เป็นวันที่ลงนามด้วย)</label>
                <input
                  id="wht-issue"
                  type="date"
                  className="input"
                  value={values.issueDate}
                  onChange={(e) => set("issueDate", e.target.value)}
                />
                {fieldError(errors, "issueDate") && (
                  <p className="mt-1 text-xs text-red-600">{fieldError(errors, "issueDate")}</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="wht-amount">จำนวนเงิน (บาท) *</label>
                  <input
                    id="wht-amount"
                    className="input font-mono"
                    inputMode="decimal"
                    placeholder="เช่น 50000"
                    value={values.amount}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                  {fieldError(errors, "amount") && (
                    <p className="mt-1 text-xs text-red-600">{fieldError(errors, "amount")}</p>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="wht-rate">อัตรา (%)</label>
                  <input
                    id="wht-rate"
                    className="input font-mono"
                    inputMode="decimal"
                    list="wht-rate-list"
                    value={values.whtRate}
                    onChange={(e) => set("whtRate", e.target.value)}
                  />
                  <datalist id="wht-rate-list">
                    <option value="1" />
                    <option value="2" />
                    <option value="3" />
                    <option value="5" />
                  </datalist>
                  {fieldError(errors, "whtRate") && (
                    <p className="mt-1 text-xs text-red-600">{fieldError(errors, "whtRate")}</p>
                  )}
                </div>
              </div>
              <div className="rounded bg-neutral-50 p-3 text-sm">
                <div>
                  ภาษีหัก:{" "}
                  <span className="font-mono font-medium">
                    {wht > 0 ? fmtNum(wht) : "—"} บาท
                  </span>
                </div>
                {thaiText && (
                  <div className="mt-1 text-neutral-600">({thaiText})</div>
                )}
                <div className="mt-1">
                  จ่ายสุทธิ:{" "}
                  <span className="font-mono font-medium">
                    {parseAmount(values.amount) > 0
                      ? fmtNum(parseAmount(values.amount) - wht)
                      : "—"}{" "}
                    บาท
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="mb-1 font-medium">ลายเซ็น / ตราประทับ</h2>
            <p className="mb-3 text-xs text-neutral-500">
              อัปโหลดรูป หรือพิมพ์ชื่อก็ได้ — ถ้ามีรูปจะใช้รูปก่อนเสมอ ไฟล์อยู่แค่ในเบราว์เซอร์ ไม่ถูกบันทึก
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="wht-sig">ลายเซ็น (รูปมี priority สูงสุด)</label>
                <input
                  id="wht-sig"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="text-sm"
                  onChange={(e) => onImage(e.target.files?.[0], "signature")}
                />
                {signature && (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signature} alt="ตัวอย่างลายเซ็น" className="h-12 border border-neutral-200 bg-white object-contain" />
                    <button type="button" className="btn !px-2 !py-1 text-xs" onClick={() => setSignature(null)}>
                      เอาออก
                    </button>
                  </div>
                )}
                <div className="my-2 text-xs text-neutral-400">— หรือพิมพ์ชื่อ —</div>
                <input
                  id="wht-sig-text"
                  className="input"
                  placeholder="พิมพ์ชื่อ-นามสกุล"
                  autoComplete="off"
                  value={sigText}
                  onChange={(e) => setSigText(e.target.value)}
                />
                {typedSig && !signature && (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={typedSig} alt="ตัวอย่างลายเซ็นแบบพิมพ์" className="h-12 border border-neutral-200 bg-white object-contain" />
                    <button type="button" className="btn !px-2 !py-1 text-xs" onClick={() => setSigText("")}>
                      เอาออก
                    </button>
                  </div>
                )}
                {typedSig && signature && (
                  <p className="mt-1 text-xs text-neutral-500">
                    กำลังใช้รูปที่อัปโหลด (รูปชนะข้อความเสมอ)
                  </p>
                )}
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showSig} onChange={(e) => setShowSig(e.target.checked)} />
                  แสดงลายเซ็นใน PDF
                </label>
              </div>
              <div>
                <label className="label" htmlFor="wht-stamp">ตราประทับ</label>
                <input
                  id="wht-stamp"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="text-sm"
                  onChange={(e) => onImage(e.target.files?.[0], "stamp")}
                />
                {stamp && (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={stamp} alt="ตัวอย่างตราประทับ" className="h-12 border border-neutral-200 bg-white object-contain" />
                    <button type="button" className="btn !px-2 !py-1 text-xs" onClick={() => setStamp(null)}>
                      เอาออก
                    </button>
                  </div>
                )}
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showStamp} onChange={(e) => setShowStamp(e.target.checked)} />
                  แสดงตราใน PDF
                </label>
              </div>
            </div>
          </section>
        </div>

        <div className="min-w-0">
          <div className="xl:sticky xl:top-6">
            <h2 className="mb-3 font-medium">ตัวอย่างก่อนพิมพ์</h2>
            <WhtPreview
              values={{ ...values, signDate: values.issueDate }}
              signature={effectiveSignature}
              stamp={stamp}
              showSig={showSig}
              showStamp={showStamp}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" onClick={download} disabled={busy}>
                {busy ? "กำลังสร้าง PDF…" : "ดาวน์โหลด PDF"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setPayerSel("");
                  setPayeeSel("");
                  setPickerResetKey((k) => k + 1);
                  setDescMode("preset");
                  setErrors([]);
                  setSubmitMsg(null);
                  setValues({
                    formType: "pnd3",
                    certificateNo: "",
                    payerName: "",
                    payerTaxId: "",
                    payerAddress: "",
                    payeeName: "",
                    payeeTaxId: "",
                    payeeAddress: "",
                    description: WHT_DESCRIPTION_PRESETS[0],
                    issueDate: todayIso(),
                    signDate: todayIso(),
                    amount: "",
                    whtRate: "3",
                  });
                }}
              >
                ล้างฟอร์ม
              </button>
            </div>
            {submitMsg && (
              <p className="mt-2 text-sm text-neutral-600">{submitMsg}</p>
            )}
            {errors.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-600">
                {errors.map((e, i) => (
                  <li key={`${e.field}-${i}`}>{e.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
