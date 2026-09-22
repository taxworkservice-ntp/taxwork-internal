"use client";

import { useState } from "react";
import type { ReportModel } from "@/lib/report-model";

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function periodToThai(periodLabel: string): string {
  const [y, m] = periodLabel.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodLabel;
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

function fmtMoney(n: number): string {
  return Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dataUriToBlob(uri: string): Blob | null {
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const meta = uri.slice(0, comma);
  if (!meta.includes(";base64")) return null;
  const mime = meta.match(/data:([^;]+)/)?.[1] || "image/png";
  try {
    const bin = atob(uri.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

type SectionSlip = {
  id: string;
  file_name: string;
  isImage: boolean;
  dataUri: string | null;
  pdfPage: number | null;
};

type Section = {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  paymentMethod: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNo: string | null;
  promptpay: string | null;
  qr: string | null;
  bankLogos: string[];
  slips: SectionSlip[];
};

function buildSections(model: ReportModel): Section[] {
  return model.filings.map((f) => ({
    id: f.id,
    title: f.form_code?.trim() || "รายการ",
    description: f.description?.trim() || null,
    amount: Number(f.amount ?? 0),
    paymentMethod: f.payment_method?.trim() || null,
    bankName: f.bank?.bank_name || f.bank?.label || null,
    accountName: f.bank?.account_name || null,
    accountNo: f.bank?.account_no || null,
    promptpay: f.bank?.promptpay_id || null,
    qr: f.qrDataUri ?? f.bank?.qrDataUri ?? null,
    bankLogos: [f.bank?.logoDataUri, f.bank?.logoBottomDataUri].filter(
      (v): v is string => Boolean(v)
    ),
    slips: f.slips.map((s) => ({
      id: s.id,
      file_name: s.file_name,
      isImage: s.isImage,
      dataUri: s.dataUri,
      pdfPage: s.pdfPage,
    })),
  }));
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800">
      <span className="h-4 w-1 rounded-full bg-neutral-900" />
      {children}
    </h2>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-neutral-400">
          {label}
        </div>
        <div className="truncate font-mono text-sm text-neutral-800">{value}</div>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // clipboard unavailable
          }
        }}
        className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
          copied
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-neutral-300 bg-white text-neutral-700 active:bg-neutral-100"
        }`}
      >
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
    </div>
  );
}

function AmountCopy({ amount }: { amount: number }) {
  const [copied, setCopied] = useState(false);
  const text = amount.toFixed(2);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable
        }
      }}
      className="text-[11px] font-medium text-blue-600 underline-offset-2 hover:underline"
    >
      {copied ? "คัดลอกแล้ว" : "คัดลอกจำนวนเงิน"}
    </button>
  );
}

function ImageBlock({
  dataUri,
  fileName,
  hint,
}: {
  dataUri: string;
  fileName: string;
  hint: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      const blob = dataUriToBlob(dataUri);
      if (
        blob &&
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard?.write
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
        return;
      }
    } catch {
      // fall through
    }
    setState("error");
    setTimeout(() => setState("idle"), 3000);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="แตะเพื่อคัดลอกรูป"
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm transition-transform active:scale-[0.98]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} alt={fileName} className="h-56 w-56 object-contain" />
      </button>
      <div className="flex items-center gap-2 text-xs">
        <a
          href={dataUri}
          download={fileName}
          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 font-medium text-neutral-700"
        >
          บันทึกไฟล์
        </a>
        <span className="text-neutral-500">
          {state === "copied"
            ? "คัดลอกรูปแล้ว"
            : state === "error"
              ? "คัดลอกอัตโนมัติไม่ได้ — ใช้ “บันทึกไฟล์”"
              : hint}
        </span>
      </div>
    </div>
  );
}

function QrBlock({ dataUri, fileName }: { dataUri: string; fileName: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      const blob = dataUriToBlob(dataUri);
      if (
        blob &&
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard?.write
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
        return;
      }
    } catch {
      // fall through
    }
    setState("error");
    setTimeout(() => setState("idle"), 3000);
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="แตะเพื่อคัดลอกรูป QR"
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm transition-transform active:scale-[0.98]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} alt={fileName} className="h-56 w-56 object-contain" />
      </button>
      {state !== "idle" && (
        <span className="mt-1 text-xs text-neutral-500">
          {state === "copied" ? "คัดลอกรูปแล้ว" : "คัดลอกไม่ได้ — แตะค้างเพื่อบันทึก"}
        </span>
      )}
    </div>
  );
}

export default function ShareView({
  model,
  hasPdf,
  token,
  expiresAt,
}: {
  model: ReportModel;
  hasPdf: boolean;
  token: string;
  expiresAt?: string | null;
}) {
  const sections = buildSections(model);
  const grandTotal = sections.reduce((sum, s) => sum + s.amount, 0);
  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 pb-20">
      {/* Header */}
      <header className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          {model.firmName}
        </div>
        <h1 className="mt-1 text-lg font-bold leading-tight text-neutral-900">
          รายงานภาษี {periodToThai(model.periodLabel)}
        </h1>
        <div className="mt-1 text-sm text-neutral-700">{model.client.name}</div>
        {model.reportNo && (
          <div className="mt-0.5 text-xs text-neutral-400">
            เลขที่รายงาน {model.reportNo}
          </div>
        )}
      </header>

      {/* Download */}
      {hasPdf && (
        <>
          <a
            href={`/r/${token}/pdf`}
            className="block rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm active:bg-neutral-800"
          >
            ดาวน์โหลดรายงาน (PDF)
          </a>
          {expiryLabel && (
            <p className="mt-1 text-center text-xs text-neutral-400">
              ลิงก์นี้ใช้ได้ถึง {expiryLabel}
            </p>
          )}
        </>
      )}

      {/* Items */}
      <section>
        <SectionTitle>รายการที่ต้องชำระ</SectionTitle>

        {sections.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500 shadow-sm">
            ไม่มีรายการที่ต้องชำระ
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
              <div className="mb-1 font-medium text-neutral-700">วิธีชำระเงิน</div>
              <ol className="list-inside list-decimal space-y-0.5">
                <li>แตะที่รูป QR / สลิป เพื่อคัดลอกรูป หรือกด “บันทึกไฟล์”</li>
                <li>เปิดแอปธนาคาร แล้วเลือกสแกน / อัปโหลด QR จากอัลบั้ม</li>
                <li>หรือโอนเข้าบัญชี / พร้อมเพย์ ตามหมายเลขที่แสดง</li>
              </ol>
            </div>

            <div className="space-y-4">
              {sections.map((s, i) => {
                const hasBank = Boolean(
                  s.bankName || s.accountNo || s.promptpay || s.bankLogos.length
                );
                const hasSlip = s.slips.length > 0;
                const hasQr = Boolean(s.qr);
                const slipPage =
                  s.slips.find((x) => x.pdfPage)?.pdfPage ?? null;
                return (
                  <div
                    key={s.id}
                    className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
                  >
                    {/* header: number + form name + amount */}
                    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 bg-neutral-50/70 px-4 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-neutral-900">
                            {s.title}
                          </div>
                          {s.description && (
                            <div className="truncate text-xs text-neutral-500">
                              {s.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold tabular-nums text-neutral-900">
                          {fmtMoney(s.amount)}
                        </div>
                        <AmountCopy amount={s.amount} />
                      </div>
                    </div>

                    {/* slips first */}
                    {hasSlip && (
                      <div className="space-y-3 border-b border-neutral-100 px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Pay-in slip
                          </span>
                          {slipPage ? (
                            <span className="text-[11px] text-neutral-400">
                              หน้า {slipPage} ในไฟล์ PDF
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-neutral-600">
                          ให้ชำระผ่าน Pay-in slip ที่แนบไว้ — เปิดไฟล์ด้านล่างแล้วชำระตามใบนำฝาก
                        </p>
                        {s.slips.map((slip) =>
                          slip.isImage && slip.dataUri ? (
                            <ImageBlock
                              key={slip.id}
                              dataUri={slip.dataUri}
                              fileName={slip.file_name}
                              hint="แตะที่สลิปเพื่อคัดลอกรูป"
                            />
                          ) : (
                            <a
                              key={slip.id}
                              href={`/r/${token}/slip/${slip.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[10px] font-bold text-neutral-500">
                                PDF
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-neutral-800">
                                  เปิดใบนำฝาก
                                </span>
                                <span
                                  className="block truncate text-xs text-neutral-500"
                                  title={slip.file_name}
                                >
                                  {slip.file_name}
                                </span>
                              </span>
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                className="shrink-0 text-neutral-400"
                              >
                                <path
                                  d="M6 3h7v7M13 3L6.5 9.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </a>
                          )
                        )}
                      </div>
                    )}

                    {/* bank / QR */}
                    {(hasBank || hasQr) && (
                      <div className="px-4 py-3">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          วิธีชำระ
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium text-neutral-800">
                            {s.bankName || (hasQr ? s.paymentMethod?.trim() || "ชำระผ่าน QR" : "")}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {hasQr && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                QR code
                              </span>
                            )}
                            {s.bankLogos.length > 0 && (
                              <div className="flex flex-col items-end gap-1">
                                {s.bankLogos.map((logo, li) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={li}
                                    src={logo}
                                    alt=""
                                    className="h-5 max-w-[88px] rounded object-contain"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {s.accountName && (
                          <div className="text-xs text-neutral-500">
                            ชื่อบัญชี {s.accountName}
                          </div>
                        )}
                        {(s.accountNo || s.promptpay) && (
                          <div className="mt-1 divide-y divide-neutral-100">
                            {s.accountNo && (
                              <CopyRow label="เลขที่บัญชี" value={s.accountNo} />
                            )}
                            {s.promptpay && (
                              <CopyRow label="พร้อมเพย์" value={s.promptpay} />
                            )}
                          </div>
                        )}
                        {hasQr && (
                          <div className="mt-3">
                            <p className="mb-2 text-xs text-neutral-600">
                              สแกน QR ด้านล่างเพื่อชำระเงิน — หรือแตะที่รูปเพื่อคัดลอก
                            </p>
                            <QrBlock
                              dataUri={s.qr!}
                              fileName={`qr-${s.title.replace(/\s+/g, "-")}.png`}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* method text / fallback */}
                    {!hasBank && !hasSlip && !hasQr && (
                      <div className="px-4 py-3 text-xs text-neutral-500">
                        {s.paymentMethod
                          ? `วิธีชำระ: ${s.paymentMethod}`
                          : "ชำระตามช่องทางที่เจ้าหน้าที่แจ้ง"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-neutral-900 px-4 py-3 text-base font-bold text-white shadow-sm">
              <span>ยอดรวมทั้งสิ้น</span>
              <span className="tabular-nums">{fmtMoney(grandTotal)} บาท</span>
            </div>
          </>
        )}

        {model.reportNo && (
          <p className="mt-3 text-center text-xs text-neutral-400">
            อ้างอิงการชำระเงิน: {model.reportNo}
          </p>
        )}
      </section>

      <footer className="flex flex-col items-center gap-1 pt-4">
        {model.logoDataUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={model.logoDataUri}
            alt={model.firmName}
            className="h-7 max-w-[50%] object-contain opacity-80"
          />
        )}
        <p className="text-[11px] text-neutral-400">
          {model.firmName} · เอกสารสร้างโดยระบบอัตโนมัติ
        </p>
      </footer>
    </main>
  );
}
