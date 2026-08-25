"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ATTACHMENT_KIND_LABELS,
  buildMonthlyReportPdf,
  fetchAttachmentBytes,
} from "@/lib/report-pdf";
import { thaiBahtText } from "@/lib/thai-baht-text";

type ClientRow = {
  id: string;
  name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type BankAccount = {
  id: string;
  label: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  promptpay_id: string | null;
};

type Attachment = {
  id: string;
  filing_id: string;
  kind: "slip" | "qr" | "document";
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
};

type Filing = {
  id: string;
  client_id: string;
  period_label: string;
  form_code: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  bank_account_id: string | null;
  sort_order: number;
  filing_attachments: Attachment[];
};

const FORM_PRESETS = [
  "ภ.พ.30",
  "ภ.พ.36",
  "ภ.ง.ด.1",
  "ภ.ง.ด.3",
  "ภ.ง.ด.53",
  "ภ.ง.ด.94",
  "ป.ภ.50 ทวิ",
  "ค่าบริการรายเดือน",
];

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function periodToThai(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return period;
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

function fmtMoney(n: number): string {
  return Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [filings, setFilings] = useState<Filing[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [showBankManager, setShowBankManager] = useState(false);
  const [newFormCode, setNewFormCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [adding, setAdding] = useState(false);

  const [bankLabel, setBankLabel] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankNo, setBankNo] = useState("");
  const [bankAcctName, setBankAcctName] = useState("");
  const [bankPromptpay, setBankPromptpay] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    (async () => {
      const [clientsRes, banksRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, tax_id, address, phone, email")
          .eq("status", "active"),
        supabase.from("bank_accounts").select("*").order("created_at"),
      ]);
      const sorted = ((clientsRes.data ?? []) as ClientRow[]).sort((a, b) =>
        a.name.localeCompare(b.name, "th")
      );
      setClients(sorted);
      setBankAccounts(banksRes.data ?? []);
    })();
  }, [supabase]);

  const loadFilings = useCallback(async () => {
    if (!clientId) {
      setFilings([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("monthly_filings")
      .select("*,filing_attachments(*)")
      .eq("client_id", clientId)
      .eq("period_label", period)
      .order("sort_order")
      .order("created_at");
    const ordered = (data ?? []) as Filing[];
    for (const f of ordered) {
      f.filing_attachments?.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    setFilings(ordered);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, period]);

  useEffect(() => {
    loadFilings();
  }, [loadFilings]);

  const reloadBanks = useCallback(async () => {
    const { data } = await supabase
      .from("bank_accounts")
      .select("*")
      .order("created_at");
    setBankAccounts(data ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = filings.reduce((sum, f) => sum + Number(f.amount ?? 0), 0);

  async function addFiling() {
    if (!clientId || !newFormCode.trim()) {
      alert("กรอกรหัสแบบฟอร์มก่อน เช่น ภ.พ.30");
      return;
    }
    setAdding(true);
    const maxSort = filings.reduce((m, f) => Math.max(m, f.sort_order), 0);
    const { data, error } = await supabase
      .from("monthly_filings")
      .insert({
        client_id: clientId,
        period_label: period,
        form_code: newFormCode.trim(),
        description: newDescription.trim() || null,
        amount: Number(newAmount) || 0,
        due_date: newDueDate || null,
        sort_order: maxSort + 1,
      })
      .select()
      .single();
    setAdding(false);
    if (error) {
      alert(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setFilings((prev) => [
      ...prev,
      { ...(data as unknown as Filing), filing_attachments: [] },
    ]);
    setNewFormCode("");
    setNewDescription("");
    setNewAmount("");
    setNewDueDate("");
  }

  async function patchFiling(id: string, patch: Partial<Filing>) {
    setFilings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
    const { error } = await supabase
      .from("monthly_filings")
      .update(patch)
      .eq("id", id);
    if (error) {
      alert(`บันทึกไม่สำเร็จ: ${error.message}`);
      loadFilings();
    }
  }

  async function deleteR2Object(storagePath: string) {
    await fetch("/api/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath }),
    });
  }

  async function deleteFiling(filing: Filing) {
    if (!confirm(`ลบรายการ "${filing.form_code}" ?`)) return;
    for (const att of filing.filing_attachments) {
      await deleteR2Object(att.storage_path);
    }
    await supabase.from("monthly_filings").delete().eq("id", filing.id);
    loadFilings();
  }

  async function uploadAttachment(
    filingId: string,
    kind: Attachment["kind"],
    file: File
  ) {
    const signRes = await fetch("/api/files/sign-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, fileName: file.name }),
    });
    if (!signRes.ok) {
      alert("ขอลิงก์อัปโหลดไม่สำเร็จ");
      return;
    }
    const { url, path } = await signRes.json();
    const putRes = await fetch(url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!putRes.ok) {
      alert("อัปโหลดไม่สำเร็จ");
      return;
    }
    const { error } = await supabase.from("filing_attachments").insert({
      filing_id: filingId,
      kind,
      storage_path: path,
      file_name: file.name,
      size_bytes: file.size,
      mime_type: file.type || null,
    });
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`);
    loadFilings();
  }

  async function deleteAttachment(att: Attachment) {
    if (!confirm(`ลบไฟล์ ${att.file_name}?`)) return;
    await deleteR2Object(att.storage_path);
    await supabase.from("filing_attachments").delete().eq("id", att.id);
    loadFilings();
  }

  async function addBankAccount() {
    if (!bankLabel.trim() || !bankName.trim() || !bankNo.trim() || !bankAcctName.trim()) {
      alert("กรอก label, ธนาคาร, เลขบัญชี และชื่อบัญชีให้ครบ");
      return;
    }
    const { error } = await supabase.from("bank_accounts").insert({
      label: bankLabel.trim(),
      bank_name: bankName.trim(),
      account_no: bankNo.trim(),
      account_name: bankAcctName.trim(),
      promptpay_id: bankPromptpay.trim() || null,
    });
    if (error) {
      alert(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setBankLabel("");
    setBankName("");
    setBankNo("");
    setBankAcctName("");
    setBankPromptpay("");
    reloadBanks();
  }

  async function deleteBankAccount(id: string) {
    if (!confirm("ลบบัญชีนี้? รายการที่ผูกไว้จะตัดการเชื่อมโยง")) return;
    await supabase.from("bank_accounts").delete().eq("id", id);
    reloadBanks();
    loadFilings();
  }

  async function generatePdf() {
    if (!selectedClient || !filings.length) return;
    if (
      !confirm(
        `สร้างรายงาน ${periodToThai(period)} ของ "${selectedClient.name}" (${filings.length} รายการ)?`
      )
    )
      return;
    setGenerating(true);
    setStatus("");
    try {
      const enriched = [];
      for (const f of filings) {
        const attachments = [];
        for (const att of f.filing_attachments) {
          const bytes = await fetchAttachmentBytes(att.storage_path);
          attachments.push({
            kind: att.kind as string,
            file_name: att.file_name,
            mime_type: att.mime_type,
            bytes,
          });
        }
        enriched.push({
          ...f,
          bank_account:
            bankAccounts.find((b) => b.id === f.bank_account_id) ?? null,
          attachments,
        });
      }

      const pdfBytes = await buildMonthlyReportPdf({
        client: {
          name: selectedClient.name,
          tax_id: selectedClient.tax_id,
          address: selectedClient.address,
          phone: selectedClient.phone,
          email: selectedClient.email,
        },
        periodLabel: period,
        filings: enriched,
      });

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `รายงานภาษี-${selectedClient.name}-${period}.pdf`;
      a.click();
      URL.revokeObjectURL(dlUrl);

      const signRes = await fetch("/api/files/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          fileName: `monthly-report-${period}.pdf`,
        }),
      });
      if (!signRes.ok) throw new Error("ขอลิงก์อัปโหลดสำเนาไม่สำเร็จ");
      const { url, path } = await signRes.json();
      const putRes = await fetch(url, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "application/pdf" },
      });
      if (!putRes.ok) throw new Error("อัปโหลดสำเนาไป R2 ไม่สำเร็จ");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("files").insert({
        client_id: clientId,
        storage_path: path,
        file_name: `รายงานภาษี ${periodToThai(period)}.pdf`,
        size_bytes: blob.size,
        mime_type: "application/pdf",
        category: "monthly-report",
        uploaded_by: user?.email ?? null,
      });

      setStatus("สร้างรายงานสำเร็จ — ดาวน์โหลดแล้ว และบันทึกสำเนาในไฟล์ของลูกค้าแล้ว");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint =
        msg.includes("Failed to fetch") || msg.includes("NetworkError")
          ? " — ตรวจว่า CORS ของ bucket R2 อนุญาต GET จากโดเมนนี้แล้ว"
          : "";
      alert(`สร้างรายงานไม่สำเร็จ: ${msg}${hint}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">รายงานรายเดือน</h1>
        <div className="flex items-center gap-2">
          <button className="btn px-2.5" onClick={() => setPeriod((p) => shiftPeriod(p, -1))}>
            ←
          </button>
          <input
            type="month"
            className="input w-auto"
            value={period}
            onChange={(e) => e.target.value && setPeriod(e.target.value)}
          />
          <button className="btn px-2.5" onClick={() => setPeriod((p) => shiftPeriod(p, 1))}>
            →
          </button>
        </div>
      </div>

      <div className="card max-w-xl space-y-3">
        <div>
          <label className="label">ลูกค้า</label>
          <select
            className="input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">— เลือกลูกค้า —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {selectedClient && (
          <div className="text-sm text-neutral-500">
            {[
              selectedClient.tax_id && `เลขผู้เสียภาษี: ${selectedClient.tax_id}`,
              selectedClient.phone,
              selectedClient.email,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
      </div>

      {!clientId ? (
        <p className="text-sm text-neutral-500">
          เลือกลูกค้าและเดือนเพื่อจัดทำรายการและสร้างรายงาน PDF
        </p>
      ) : (
        <>
          <section className="max-w-4xl space-y-3">
            <h2 className="font-medium">
              รายการงานภาษี ประจำเดือน {periodToThai(period)}
            </h2>

            <div className="card grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_120px_150px_auto] sm:items-end">
              <div>
                <label className="label">แบบฟอร์ม</label>
                <input
                  className="input"
                  list="form-presets"
                  placeholder="ภ.พ.30"
                  value={newFormCode}
                  onChange={(e) => setNewFormCode(e.target.value)}
                />
                <datalist id="form-presets">
                  {FORM_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label">รายละเอียด</label>
                <input
                  className="input"
                  placeholder="เช่น ภาษีมูลค่าเพิ่ม เดือน 7/69"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="label">จำนวนเงิน</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label">กำหนดชำระ</label>
                <input
                  className="input"
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>
              <button className="btn-primary" onClick={addFiling} disabled={adding}>
                เพิ่มรายการ
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-neutral-500">กำลังโหลด...</p>
            ) : !filings.length ? (
              <p className="text-sm text-neutral-500">
                ยังไม่มีรายการในเดือนนี้ — เพิ่มรายการแรกด้านบน
              </p>
            ) : (
              filings.map((f) => (
                <FilingCard
                  key={f.id}
                  filing={f}
                  bankAccounts={bankAccounts}
                  onPatch={patchFiling}
                  onDelete={() => deleteFiling(f)}
                  onUpload={(kind, file) =>
                    uploadAttachment(f.id, kind, file)
                  }
                  onDeleteAttachment={deleteAttachment}
                />
              ))
            )}

            {Boolean(filings.length) && (
              <div className="card flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-medium">ยอดรวม: {fmtMoney(total)} บาท</span>
                  <div className="text-xs text-neutral-500">
                    ({thaiBahtText(total)})
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {status && (
                    <span className="text-xs text-green-700">{status}</span>
                  )}
                  <button
                    className="btn-primary"
                    onClick={generatePdf}
                    disabled={generating}
                  >
                    {generating ? "กำลังสร้าง..." : "สร้างรายงาน PDF"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="max-w-4xl">
            <button
              className="btn"
              onClick={() => setShowBankManager((v) => !v)}
            >
              {showBankManager ? "ซ่อนบัญชีธนาคาร" : "บัญชีธนาคาร (สำหรับค่าบริการ)"}
            </button>

            {showBankManager && (
              <div className="mt-3 space-y-3">
                <div className="overflow-x-auto">
                  <table className="table-base w-full min-w-[600px]">
                    <thead>
                      <tr>
                        <th>ชื่อ</th>
                        <th>ธนาคาร</th>
                        <th>เลขบัญชี</th>
                        <th>ชื่อบัญชี</th>
                        <th>PromptPay</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankAccounts.map((b) => (
                        <tr key={b.id}>
                          <td>{b.label}</td>
                          <td>{b.bank_name}</td>
                          <td>{b.account_no}</td>
                          <td>{b.account_name}</td>
                          <td>{b.promptpay_id ?? "-"}</td>
                          <td className="text-right">
                            <button
                              className="btn-danger px-1.5 py-0.5 text-xs"
                              onClick={() => deleteBankAccount(b.id)}
                            >
                              ลบ
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!bankAccounts.length && (
                        <tr>
                          <td colSpan={6} className="text-neutral-500">
                            ยังไม่มีบัญชี
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="card grid grid-cols-1 gap-2 sm:grid-cols-5 sm:items-end">
                  <div>
                    <label className="label">ชื่อ (label)</label>
                    <input
                      className="input"
                      placeholder="MyServices"
                      value={bankLabel}
                      onChange={(e) => setBankLabel(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">ธนาคาร</label>
                    <input
                      className="input"
                      placeholder="กสิกรไทย"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">เลขบัญชี</label>
                    <input
                      className="input"
                      value={bankNo}
                      onChange={(e) => setBankNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">ชื่อบัญชี</label>
                    <input
                      className="input"
                      value={bankAcctName}
                      onChange={(e) => setBankAcctName(e.target.value)}
                    />
                  </div>
                  <button className="btn-primary" onClick={addBankAccount}>
                    เพิ่มบัญชี
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function FilingCard({
  filing,
  bankAccounts,
  onPatch,
  onDelete,
  onUpload,
  onDeleteAttachment,
}: {
  filing: Filing;
  bankAccounts: BankAccount[];
  onPatch: (id: string, patch: Partial<Filing>) => void;
  onDelete: () => void;
  onUpload: (kind: Attachment["kind"], file: File) => void;
  onDeleteAttachment: (att: Attachment) => void;
}) {
  function blurField(
    key: "form_code" | "description" | "amount" | "due_date",
    raw: string
  ) {
    if (key === "amount") {
      const num = Number(raw) || 0;
      if (num !== Number(filing.amount)) onPatch(filing.id, { amount: num });
      return;
    }
    if (key === "due_date") {
      if ((raw || null) !== filing.due_date)
        onPatch(filing.id, { due_date: raw || null });
      return;
    }
    const val = raw.trim() || null;
    if (val !== filing[key]) onPatch(filing.id, { [key]: val });
  }

  return (
    <div className="card space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_130px_150px_190px_auto] sm:items-end">
        <div>
          <label className="label">แบบฟอร์ม</label>
          <input
            className="input"
            list="form-presets"
            defaultValue={filing.form_code}
            onBlur={(e) => blurField("form_code", e.target.value)}
          />
        </div>
        <div>
          <label className="label">รายละเอียด</label>
          <input
            className="input"
            defaultValue={filing.description ?? ""}
            onBlur={(e) => blurField("description", e.target.value)}
          />
        </div>
        <div>
          <label className="label">จำนวนเงิน</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            defaultValue={Number(filing.amount)}
            onBlur={(e) => blurField("amount", e.target.value)}
          />
        </div>
        <div>
          <label className="label">กำหนดชำระ</label>
          <input
            className="input"
            type="date"
            defaultValue={filing.due_date ?? ""}
            onBlur={(e) => blurField("due_date", e.target.value)}
          />
        </div>
        <div>
          <label className="label">แนบบัญชีธนาคาร</label>
          <select
            className="input"
            value={filing.bank_account_id ?? ""}
            onChange={(e) =>
              onPatch(filing.id, { bank_account_id: e.target.value || null })
            }
          >
            <option value="">— ไม่แนบ —</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} ({b.bank_name})
              </option>
            ))}
          </select>
        </div>
        <button className="btn-danger" onClick={onDelete}>
          ลบ
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
        {(["slip", "qr", "document"] as const).map((kind) => (
          <label key={kind} className="btn cursor-pointer text-xs">
            + {ATTACHMENT_KIND_LABELS[kind]}
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,.pdf"
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (!list?.length) return;
                Array.from(list).forEach((file) => onUpload(kind, file));
                e.target.value = "";
              }}
            />
          </label>
        ))}
        <span className="ml-auto flex flex-wrap gap-1">
          {filing.filing_attachments.length ? (
            filing.filing_attachments.map((att) => (
              <span
                key={att.id}
                className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs"
              >
                [{ATTACHMENT_KIND_LABELS[att.kind] ?? att.kind}]{" "}
                {truncateName(att.file_name)}
                <button
                  className="text-red-500 hover:text-red-700"
                  onClick={() => onDeleteAttachment(att)}
                  aria-label="ลบไฟล์แนบ"
                >
                  ✕
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-neutral-400">ยังไม่มีไฟล์แนบ</span>
          )}
        </span>
      </div>
    </div>
  );
}

function truncateName(name: string, max = 28) {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}
