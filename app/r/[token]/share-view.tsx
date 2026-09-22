"use client";

import { useState } from "react";
import type { ReportModel, ReportModelFiling } from "@/lib/report-model";

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

const BANK_APPS: { test: RegExp; name: string; scheme: string }[] = [
  { test: /กสิกร|kbank|k\s?plus/i, name: "เปิด K PLUS", scheme: "kplus://" },
  { test: /ไทยพาณิชย์|scb/i, name: "เปิด SCB EASY", scheme: "scbeasy://" },
  { test: /กรุงเทพ|bangkok|bbl/i, name: "เปิด Bualuang mBanking", scheme: "bualuangmbanking://" },
  { test: /กรุงไทย|krungthai|ktb/i, name: "เปิด Krungthai NEXT", scheme: "ktbnext://" },
  { test: /กรุงศรี|krungsri|kma/i, name: "เปิด KMA", scheme: "krungsri-kma://" },
];

type Group = {
  key: string;
  title: string;
  lines: string[];
  qr: string | null;
  accountNo: string | null;
  promptpay: string | null;
  bankName: string;
  items: ReportModelFiling[];
};

function groupFilings(model: ReportModel): Group[] {
  const map = new Map<string, Group>();
  for (const f of model.filings) {
    if (!f.bank && !f.qrDataUri && !f.payment_method) continue;
    const key = f.bank?.id ?? `qr-${f.id}`;
    if (!map.has(key)) {
      const b = f.bank;
      const lines: string[] = [];
      if (b) {
        if (b.bank_name) lines.push(b.bank_name);
        if (b.account_name) lines.push(`ชื่อบัญชี ${b.account_name}`);
      }
      map.set(key, {
        key,
        title: b?.bank_name || b?.label || f.form_code || "QR",
        lines,
        qr: b?.qrDataUri ?? null,
        accountNo: b?.account_no ?? null,
        promptpay: b?.promptpay_id ?? null,
        bankName: b?.bank_name ?? "",
        items: [],
      });
    }
    const g = map.get(key)!;
    if (f.qrDataUri && !g.qr) g.qr = f.qrDataUri;
    g.items.push(f);
  }
  return [...map.values()];
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
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
      className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700"
    >
      {copied ? "คัดลอกแล้ว" : label}
    </button>
  );
}

export default function ShareView({
  model,
  hasPdf,
  token,
}: {
  model: ReportModel;
  hasPdf: boolean;
  token: string;
}) {
  const groups = groupFilings(model);
  const grandTotal = groups.reduce(
    (sum, g) => sum + g.items.reduce((s, f) => s + Number(f.amount ?? 0), 0),
    0
  );

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-16">
      <header className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {model.firmName}
        </div>
        <h1 className="text-lg font-bold leading-tight">
          รายงานภาษี {periodToThai(model.periodLabel)}
        </h1>
        <div className="text-sm text-neutral-600">{model.client.name}</div>
        {model.reportNo && (
          <div className="text-xs text-neutral-400">เลขที่รายงาน {model.reportNo}</div>
        )}
      </header>

      {hasPdf && (
        <a
          href={`/r/${token}/pdf`}
          className="block rounded-lg bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white"
        >
          ดาวน์โหลดรายงาน (PDF)
        </a>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">ช่องทางการชำระเงิน</h2>
        <p className="text-xs text-neutral-500">
          สแกนด้วยแอปธนาคาร หรือบันทึกภาพแล้วเลือกสแกนจากอัลบั้ม
        </p>

        {groups.length === 0 && (
          <p className="text-sm text-neutral-500">ไม่มีรายการที่ต้องชำระ</p>
        )}

        {groups.map((g) => {
          const subtotal = g.items.reduce((s, f) => s + Number(f.amount ?? 0), 0);
          const app = BANK_APPS.find((b) => b.test.test(g.bankName));
          return (
            <div key={g.key} className="rounded-lg border border-neutral-200 p-3">
              <div className="text-sm font-bold">{g.title}</div>
              {g.lines.slice(1).map((l, i) => (
                <div key={i} className="text-sm text-neutral-700">
                  {l}
                </div>
              ))}

              {g.accountNo && (
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span>เลขที่บัญชี {g.accountNo}</span>
                  <CopyButton value={g.accountNo} label="คัดลอก" />
                </div>
              )}
              {g.promptpay && (
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span>พร้อมเพย์ {g.promptpay}</span>
                  <CopyButton value={g.promptpay} label="คัดลอก" />
                </div>
              )}

              {g.qr && (
                <div className="mt-3 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.qr}
                    alt="QR"
                    className="h-56 w-56 rounded border border-neutral-200 bg-white object-contain p-2"
                  />
                </div>
              )}

              <ul className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100">
                {g.items.map((f) => (
                  <li key={f.id} className="flex justify-between py-1.5 text-sm">
                    <span>{f.form_code || "-"}</span>
                    <span className="text-neutral-600">{fmtMoney(f.amount)} บาท</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between pt-2 text-sm font-semibold">
                <span>รวมบัญชีนี้</span>
                <span>{fmtMoney(subtotal)} บาท</span>
              </div>

              {app && (
                <a
                  href={app.scheme}
                  className="mt-3 block rounded border border-neutral-300 px-3 py-2 text-center text-sm font-medium"
                >
                  {app.name}
                </a>
              )}
            </div>
          );
        })}

        {groups.length > 0 && (
          <div className="flex justify-between border-t-2 border-neutral-900 pt-3 text-base font-bold">
            <span>ยอดรวมทั้งสิ้น</span>
            <span>{fmtMoney(grandTotal)} บาท</span>
          </div>
        )}

        {model.reportNo && (
          <p className="text-xs text-neutral-400">
            อ้างอิงการชำระเงิน: {model.reportNo}
          </p>
        )}
      </section>
    </main>
  );
}
