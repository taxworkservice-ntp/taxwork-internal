"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addBankAccount as addBankAccountAction,
  addFiling as addFilingAction,
  clearFilings,
  copyMonthFilings,
  deleteBankAccount as deleteBankAccountAction,
  deleteFiling as deleteFilingAction,
  getAppSettings,
  listActiveClients,
  listBankAccounts,
  listCustomFormCodes,
  loadFilings as loadFilingsAction,
  patchFiling as patchFilingAction,
  recordReportFile,
  rememberFormCode as rememberFormCodeAction,
  saveAppSettings,
  setBankQr,
  type BankAccount,
  type ClientRow,
  type Filing,
} from "@/lib/actions/reports";
import {
  buildMonthlyReportPdf,
  fetchAttachmentBytes,
  type ReportDocument,
  type ReportFiling,
} from "@/lib/report-pdf";
import { thaiBahtText } from "@/lib/thai-baht-text";

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

function sniffImageMime(bytes: ArrayBuffer): string {
  const v = new Uint8Array(bytes);
  if (v[0] === 0x89 && v[1] === 0x50) return "image/png";
  if (v[0] === 0xff && v[1] === 0xd8) return "image/jpeg";
  return "application/octet-stream";
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
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [filings, setFilings] = useState<Filing[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [showBankManager, setShowBankManager] = useState(false);
  const [newFormCode, setNewFormCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [adding, setAdding] = useState(false);
  const [copyingFrom, setCopyingFrom] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [customFormCodes, setCustomFormCodes] = useState<string[]>([]);
  const loadSeq = useRef(0);

  const [showSettings, setShowSettings] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [qrBusyId, setQrBusyId] = useState<string | null>(null);

  const [bankLabel, setBankLabel] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankNo, setBankNo] = useState("");
  const [bankAcctName, setBankAcctName] = useState("");
  const [bankPromptpay, setBankPromptpay] = useState("");

  // Part 2: ordered documents (upload order = PDF order, session-local)
  const [docs, setDocs] = useState<{ id: string; file: File }[]>([]);
  const [docsDragActive, setDocsDragActive] = useState(false);
  const docsInputRef = useRef<HTMLInputElement>(null);

  function addDocs(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setDocs((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`,
        file,
      })),
    ]);
  }

  function moveDoc(id: string, delta: -1 | 1) {
    setDocs((prev) => {
      const i = prev.findIndex((d) => d.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[i], next[j]];
      return next;
    });
  }

  function removeDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  useEffect(() => {
    (async () => {
      setCustomFormCodes(await listCustomFormCodes());
    })();
  }, []);

  const formPresetList = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of [
      ...FORM_PRESETS,
      ...[...customFormCodes].sort((a, b) => a.localeCompare(b, "th")),
    ]) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
    return out;
  }, [customFormCodes]);

  function rememberFormCode(raw: string) {
    const code = raw.trim();
    if (!code || FORM_PRESETS.includes(code)) return;
    setCustomFormCodes((prev) =>
      prev.includes(code) ? prev : [...prev, code]
    );
    rememberFormCodeAction(code).catch((err) => {
      console.error("save form code failed:", err);
    });
  }

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    (async () => {
      const [clientRows, bankRows] = await Promise.all([
        listActiveClients(),
        listBankAccounts(),
      ]);
      const sorted = [...clientRows].sort((a, b) =>
        a.name.localeCompare(b.name, "th")
      );
      setClients(sorted);
      setBankAccounts(bankRows);
    })();
  }, []);

  const loadFilings = useCallback(async () => {
    if (!clientId) {
      setFilings([]);
      setLoadedKey(null);
      return;
    }
    const key = `${clientId}|${period}`;
    setLoadedKey((k) => (k === key ? k : null));
    setLoading(true);
    loadSeq.current += 1;
    const seq = loadSeq.current;
    try {
      const ordered = await loadFilingsAction(clientId, period);
      if (seq !== loadSeq.current) return;
      setFilings(ordered);
    } catch (error) {
      console.error("loadFilings failed:", error);
      setStatus(`โหลดรายการไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
      setFilings([]);
    }
    setLoadedKey(key);
    setLoading(false);
     
  }, [clientId, period]);

  useEffect(() => {
    loadFilings();
  }, [loadFilings]);

  // Docs belong to one cover — reset when switching client/month
  useEffect(() => {
    setDocs([]);
  }, [clientId, period]);

  const reloadBanks = useCallback(async () => {
    setBankAccounts(await listBankAccounts());
     
  }, []);

  useEffect(() => {
    (async () => {
      const data = await getAppSettings();
      setLogoPath(data?.company_logo_path ?? null);
      setLogoFileName(data?.company_logo_file_name ?? null);
      setSettingsLoading(false);
    })();
  }, []);

  async function saveSettingsLogo(path: string | null, fileName: string | null) {
    try {
      await saveAppSettings(path, fileName);
    } catch (error) {
      alert(`บันทึกการตั้งค่าไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
    }
  }

  async function handleLogoUpload(file: File) {
    setLogoBusy(true);
    try {
      const path = await uploadObject(file.name, file);
      const old = logoPath;
      setLogoPath(path);
      setLogoFileName(file.name);
      await saveSettingsLogo(path, file.name);
      if (old && old !== path) deleteR2Object(old);
    } catch (err) {
      alert(`อัปโหลดโลโก้ไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleLogoRemove() {
    if (!logoPath || !confirm("ลบโลโก้ออกจากรายงาน?")) return;
    setLogoBusy(true);
    try {
      await deleteR2Object(logoPath);
      setLogoPath(null);
      setLogoFileName(null);
      await saveSettingsLogo(null, null);
    } finally {
      setLogoBusy(false);
    }
  }

  useEffect(() => {
    if (!showSettings || !logoPath) {
      setLogoPreviewUrl(null);
      return;
    }
    let revoked: string | null = null;
    (async () => {
      try {
        const bytes = await fetchAttachmentBytes(logoPath);
        const url = URL.createObjectURL(
          new Blob([bytes], { type: sniffImageMime(bytes) })
        );
        revoked = url;
        setLogoPreviewUrl(url);
      } catch {
        setLogoPreviewUrl(null);
      }
    })();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [showSettings, logoPath]);

  const total = filings.reduce((sum, f) => sum + Number(f.amount ?? 0), 0);

  const [copyOffset, setCopyOffset] = useState(1);

  async function copyFromPastMonth() {
    if (!clientId) return;
    const prevPeriod = shiftPeriod(period, -copyOffset);
    if (
      filings.length &&
      !confirm(
        `มีรายการอยู่แล้ว ${filings.length} รายการ — คัดลอกจาก ${periodToThai(prevPeriod)} เพิ่มเข้าไปหรือไม่? (รายการเดิมจะไม่ถูกลบ)`
      )
    )
      return;
    setCopyingFrom(true);
    try {
      const inserted = await copyMonthFilings(clientId, prevPeriod, period);
      if (!inserted.length) {
        alert(`ไม่พบรายการของ ${periodToThai(prevPeriod)} สำหรับลูกค้านี้`);
        return;
      }
      inserted.forEach((f) => rememberFormCode(f.form_code));
      setFilings((prev) => [...prev, ...inserted]);
    } catch (err) {
      alert(`คัดลอกรายการไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setCopyingFrom(false);
    }
  }

  async function addFiling() {
    if (!clientId || !newFormCode.trim()) {
      alert("กรอกรหัสแบบฟอร์มก่อน เช่น ภ.พ.30");
      return;
    }
    setAdding(true);
    try {
      const created = await addFilingAction(clientId, period, {
        form_code: newFormCode.trim(),
        description: newDescription.trim() || null,
        amount: Number(newAmount) || 0,
        due_date: null,
        payment_method: newPaymentMethod.trim() || null,
      });
      rememberFormCode(newFormCode.trim());
      setFilings((prev) => [...prev, created]);
      setNewFormCode("");
      setNewDescription("");
      setNewAmount("");
      setNewPaymentMethod("");
    } catch (error) {
      alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
    } finally {
      setAdding(false);
    }
  }

  async function patchFiling(id: string, patch: Partial<Filing>) {
    setFilings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
    try {
      await patchFilingAction(id, patch);
    } catch (error) {
      alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
      loadFilings();
      return;
    }
    if (typeof patch.form_code === "string") rememberFormCode(patch.form_code);
  }

  async function deleteR2Object(storagePath: string) {
    await fetch("/api/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath }),
    });
  }

  async function uploadObject(fileName: string, file: File): Promise<string> {
    const signRes = await fetch("/api/files/sign-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName }),
    });
    if (!signRes.ok) throw new Error("ขอลิงก์อัปโหลดไม่สำเร็จ");
    const { url, path } = await signRes.json();
    const putRes = await fetch(url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!putRes.ok) throw new Error("อัปโหลดไม่สำเร็จ");
    return path as string;
  }

  async function deleteFiling(filing: Filing) {
    if (!confirm(`ลบรายการ "${filing.form_code}" ?`)) return;
    await deleteFilingAction(filing.id);
    loadFilings();
  }

  async function clearAllFilings() {
    if (!clientId || !filings.length) return;
    if (
      !confirm(
        `ลบรายการทั้งหมด ${filings.length} รายการ ของ ${periodToThai(period)} ?\nไม่สามารถกู้คืนได้`
      )
    )
      return;
    setClearingAll(true);
    try {
      await clearFilings(clientId, period);
      loadFilings();
    } catch (err) {
      alert(`ลบรายการไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setClearingAll(false);
    }
  }

  async function addBankAccount() {
    if (!bankLabel.trim() || !bankName.trim() || !bankNo.trim() || !bankAcctName.trim()) {
      alert("กรอก label, ธนาคาร, เลขบัญชี และชื่อบัญชีให้ครบ");
      return;
    }
    try {
      await addBankAccountAction({
        label: bankLabel.trim(),
        bank_name: bankName.trim(),
        account_no: bankNo.trim(),
        account_name: bankAcctName.trim(),
        promptpay_id: bankPromptpay.trim() || null,
      });
    } catch (error) {
      alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
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
    const bank = bankAccounts.find((b) => b.id === id);
    if (bank?.qr_path) deleteR2Object(bank.qr_path);
    await deleteBankAccountAction(id);
    reloadBanks();
    loadFilings();
  }

  async function handleBankQrUpload(bankId: string, file: File) {
    setQrBusyId(bankId);
    try {
      const path = await uploadObject(file.name, file);
      const bank = bankAccounts.find((b) => b.id === bankId);
      setBankAccounts((prev) =>
        prev.map((b) => (b.id === bankId ? { ...b, qr_path: path } : b))
      );
      await setBankQr(bankId, path);
      if (bank?.qr_path && bank.qr_path !== path) deleteR2Object(bank.qr_path);
    } catch (err) {
      alert(`อัปโหลด QR ไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      reloadBanks();
    } finally {
      setQrBusyId(null);
    }
  }

  async function handleBankQrRemove(bankId: string) {
    const bank = bankAccounts.find((b) => b.id === bankId);
    if (!bank?.qr_path || !confirm("ลบ QR ของบัญชีนี้?")) return;
    setQrBusyId(bankId);
    try {
      setBankAccounts((prev) =>
        prev.map((b) => (b.id === bankId ? { ...b, qr_path: null } : b))
      );
      await setBankQr(bankId, null);
      deleteR2Object(bank.qr_path);
    } finally {
      setQrBusyId(null);
    }
  }

  async function generatePdf() {
    if (!selectedClient || !filings.length) return;
    if (
      !confirm(
        `สร้างรายงาน ${periodToThai(period)} ของ "${selectedClient.name}" (${filings.length} รายการ + ${docs.length} เอกสาร)?`
      )
    )
      return;
    setGenerating(true);
    setStatus("");
    try {
      // Part 1: cover rows (no per-filing files anymore)
      const bankQrCache = new Map<string, ArrayBuffer | null>();
      const usedBanks = new Set(
        filings
          .map((f) => f.bank_account_id)
          .filter((id): id is string => Boolean(id))
      );
      for (const bankId of usedBanks) {
        const bank = bankAccounts.find((b) => b.id === bankId);
        if (bank?.qr_path) {
          try {
            bankQrCache.set(bankId, await fetchAttachmentBytes(bank.qr_path));
          } catch {
            bankQrCache.set(bankId, null);
          }
        } else {
          bankQrCache.set(bankId, null);
        }
      }

      const enriched: ReportFiling[] = filings.map((f) => {
        const ba = bankAccounts.find((b) => b.id === f.bank_account_id);
        return {
          id: f.id,
          form_code: f.form_code,
          description: f.description,
          amount: Number(f.amount ?? 0),
          due_date: f.due_date,
          remark: f.remark ?? null,
          payment_method: f.payment_method ?? null,
          bank_account: ba
            ? {
                label: ba.label,
                bank_name: ba.bank_name,
                account_no: ba.account_no,
                account_name: ba.account_name,
                promptpay_id: ba.promptpay_id,
                qr_bytes: bankQrCache.get(ba.id) ?? null,
              }
            : null,
          attachments: [],
        };
      });

      // Part 2: ordered documents, upload order = PDF order
      const documents: ReportDocument[] = [];
      for (const d of docs) {
        documents.push({
          file_name: d.file.name,
          mime_type: d.file.type || null,
          bytes: await d.file.arrayBuffer(),
        });
      }

      let logoBytes: ArrayBuffer | null = null;
      if (logoPath) {
        try {
          logoBytes = await fetchAttachmentBytes(logoPath);
        } catch {
          logoBytes = null;
        }
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
        logo: logoBytes ? { bytes: logoBytes } : null,
        documents,
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

      await recordReportFile(
        clientId,
        path,
        `รายงานภาษี ${periodToThai(period)}.pdf`,
        blob.size
      );

      setStatus("สร้างรายงานสำเร็จ — ดาวน์โหลดแล้ว และบันทึกสำเนาในไฟล์ของลูกค้าแล้ว");
    } catch (err) {
      alert(`สร้างรายงานไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
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
          <select
            className="input w-auto !py-1 text-xs"
            value={copyOffset}
            onChange={(e) => setCopyOffset(Number(e.target.value))}
            title="เลือกเดือนต้นทางที่จะคัดลอก"
            aria-label="เลือกเดือนต้นทางที่จะคัดลอก"
            disabled={!clientId || copyingFrom}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {periodToThai(shiftPeriod(period, -n))}
              </option>
            ))}
          </select>
          <button
            className="btn px-2.5"
            title="คัดลอกรายการจากเดือนที่เลือก"
            aria-label="คัดลอกรายการจากเดือนที่เลือก"
            onClick={copyFromPastMonth}
            disabled={!clientId || copyingFrom}
          >
            {copyingFrom ? <SpinnerIcon /> : <CopyIcon />}
          </button>
          <button
            className="btn px-2.5"
            title="ตั้งค่ารายงาน (โลโก้บริษัท)"
            aria-label="ตั้งค่ารายงาน"
            onClick={() => setShowSettings(true)}
          >
            <GearIcon />
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
              ส่วนที่ 1 — ปก: รายการงานภาษี ประจำเดือน {periodToThai(period)}
            </h2>

            <div className="card grid grid-cols-2 gap-x-2 gap-y-3 lg:grid-cols-[150px_135px_minmax(0,1.7fr)_170px_auto] lg:items-end lg:gap-x-3">
              <div className="order-1 lg:order-none">
                <label className="label">แบบฟอร์ม</label>
                <input
                  className="input"
                  list="form-presets"
                  placeholder="ภ.พ.30"
                  value={newFormCode}
                  onChange={(e) => setNewFormCode(e.target.value)}
                />
                <datalist id="form-presets">
                  {formPresetList.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div className="order-2 lg:order-none">
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
              <div className="order-3 col-span-2 lg:order-none lg:col-span-1">
                <label className="label">รายละเอียด</label>
                <input
                  className="input"
                  placeholder="เช่น ภาษีมูลค่าเพิ่ม เดือน 7/69"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
              <div className="order-4 lg:order-none">
                <label className="label">วิธีชำระ</label>
                <input
                  className="input"
                  placeholder="เช่น สลิป หน้า 2"
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value)}
                />
              </div>
              <button
                className="btn-primary order-5 col-span-2 lg:order-none lg:col-span-1"
                onClick={addFiling}
                disabled={adding}
              >
                เพิ่มรายการ
              </button>
            </div>

            {loading && loadedKey !== `${clientId}|${period}` ? (
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
                  <button
                    className="btn-danger"
                    onClick={clearAllFilings}
                    disabled={!filings.length || clearingAll || generating}
                    title="ลบรายการทั้งหมดของเดือนที่เลือก"
                  >
                    {clearingAll ? "กำลังลบ..." : `ลบทั้งหมด (${filings.length})`}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="max-w-4xl space-y-3">
            <h2 className="font-medium">ส่วนที่ 2 — เอกสารแนบ (ตามลำดับอัปโหลด)</h2>
            <p className="-mt-2 text-xs text-neutral-500">
              ลากไฟล์มาวาง จัดลำดับ แล้วรวมต่อท้ายปกเป็นไฟล์เดียว
            </p>
            <div className="card space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDocsDragActive(true);
                }}
                onDragLeave={() => setDocsDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDocsDragActive(false);
                  if (e.dataTransfer.files?.length) addDocs(e.dataTransfer.files);
                }}
                onClick={() => docsInputRef.current?.click()}
                className={`cursor-pointer rounded border-2 border-dashed p-4 text-center text-sm transition ${
                  docsDragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
                }`}
              >
                <input
                  ref={docsInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) addDocs(e.target.files);
                    e.target.value = "";
                  }}
                />
                ลากไฟล์มาวาง หรือคลิกเพื่อเลือก (PDF / PNG / JPG — เลือกได้หลายไฟล์)
              </div>
              {!docs.length ? (
                <p className="text-sm text-neutral-500">
                  ยังไม่มีเอกสาร — ไฟล์จะต่อท้ายปกตามลำดับที่แสดง
                </p>
              ) : (
                <>
                  <ol className="space-y-1 text-sm text-neutral-600">
                    {docs.map((d, i) => (
                      <li
                        key={d.id}
                        className="flex items-center gap-1 rounded border border-neutral-100 px-2 py-1"
                      >
                        <span className="mr-1 text-xs text-neutral-400">{i + 1}.</span>
                        <span className="min-w-0 flex-1 truncate" title={d.file.name}>
                          {d.file.name}
                          <span className="ml-1 text-xs text-neutral-400">
                            {(d.file.size / 1024).toFixed(0)} KB
                          </span>
                        </span>
                        <button
                          className="btn !px-1.5 !py-0.5 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveDoc(d.id, -1);
                          }}
                          disabled={i === 0}
                          aria-label="เลื่อนขึ้น"
                        >
                          ↑
                        </button>
                        <button
                          className="btn !px-1.5 !py-0.5 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveDoc(d.id, 1);
                          }}
                          disabled={i === docs.length - 1}
                          aria-label="เลื่อนลง"
                        >
                          ↓
                        </button>
                        <button
                          className="text-neutral-400 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeDoc(d.id);
                          }}
                          aria-label="ลบเอกสาร"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ol>
                  <div>
                    <button className="btn-danger text-xs" onClick={() => setDocs([])}>
                      ล้างเอกสาร ({docs.length})
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {Boolean(filings.length) && (
            <section className="max-w-4xl">
              <div className="card flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-medium">
                    ปก {filings.length} รายการ + เอกสาร {docs.length} ไฟล์
                  </span>
                  <div className="text-xs text-neutral-500">
                    ยอดรวม {fmtMoney(total)} บาท
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
                    {generating ? "กำลังสร้าง..." : "ดาวน์โหลด PDF"}
                  </button>
                </div>
              </div>
            </section>
          )}

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
                  <table className="table-base w-full min-w-[760px]">
                    <thead>
                      <tr>
                        <th>ชื่อ</th>
                        <th>ธนาคาร</th>
                        <th>เลขบัญชี</th>
                        <th>ชื่อบัญชี</th>
                        <th>PromptPay</th>
                        <th>QR สำหรับสแกนจ่าย</th>
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
                          <td>
                            {b.qr_path ? (
                              <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                                QR
                                <button
                                  className="text-red-500 hover:text-red-700"
                                  aria-label="ลบ QR"
                                  onClick={() => handleBankQrRemove(b.id)}
                                  disabled={qrBusyId === b.id}
                                >
                                  ✕
                                </button>
                              </span>
                            ) : (
                              <label className="btn inline-flex cursor-pointer text-xs">
                                {qrBusyId === b.id ? "..." : "+QR"}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg"
                                  className="hidden"
                                  disabled={qrBusyId === b.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    handleBankQrUpload(b.id, file);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                          </td>
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
                          <td colSpan={7} className="text-neutral-500">
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

      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="card w-full max-w-md space-y-4 bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">ตั้งค่ารายงาน</h2>
              <button
                className="text-neutral-400 hover:text-neutral-700"
                onClick={() => setShowSettings(false)}
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="label">โลโก้บริษัท (Watermark หน้าปก)</label>
              <p className="text-xs text-neutral-500">
                แสดงมุมขวาล่างของหน้าปกรายงาน PDF (ความทึบ 65%) — รองรับ PNG/JPG
              </p>
              {settingsLoading ? (
                <p className="text-xs text-neutral-500">กำลังโหลด...</p>
              ) : logoPreviewUrl ? (
                <div className="flex flex-col items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreviewUrl}
                    alt="โลโก้"
                    className="max-h-24 rounded border border-neutral-200 bg-neutral-50 object-contain p-2"
                  />
                  <span className="text-xs text-neutral-500">
                    {logoFileName}
                  </span>
                  <button
                    className="btn-danger text-xs"
                    onClick={handleLogoRemove}
                    disabled={logoBusy}
                  >
                    ลบโลโก้
                  </button>
                </div>
              ) : (
                <label className="btn inline-flex cursor-pointer text-xs">
                  {logoBusy ? "กำลังอัปโหลด..." : "เลือกไฟล์โลโก้..."}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    disabled={logoBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      handleLogoUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            <div className="flex justify-end">
              <button
                className="btn-primary"
                onClick={() => setShowSettings(false)}
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilingCard({
  filing,
  bankAccounts,
  onPatch,
  onDelete,
}: {
  filing: Filing;
  bankAccounts: BankAccount[];
  onPatch: (id: string, patch: Partial<Filing>) => void;
  onDelete: () => void;
}) {
  const editingRef = useRef<string | null>(null);
  const [draft, setDraft] = useState({
    form_code: filing.form_code,
    description: filing.description ?? "",
    amount: String(Number(filing.amount)),
    payment_method: filing.payment_method ?? "",
  });

  useEffect(() => {
    setDraft((prev) => ({
      form_code:
        prev.form_code !== filing.form_code && editingRef.current === "form_code"
          ? prev.form_code
          : filing.form_code,
      description:
        prev.description !== (filing.description ?? "") &&
        editingRef.current === "description"
          ? prev.description
          : filing.description ?? "",
      amount:
        Number(prev.amount) !== Number(filing.amount) &&
        editingRef.current === "amount"
          ? prev.amount
          : String(Number(filing.amount)),
      payment_method:
        prev.payment_method !== (filing.payment_method ?? "") &&
        editingRef.current === "payment_method"
          ? prev.payment_method
          : filing.payment_method ?? "",
    }));
  }, [filing]);

  function commitField(
    key: "form_code" | "description" | "amount" | "payment_method"
  ) {
    const raw = draft[key];
    if (key === "amount") {
      const num = Number(raw) || 0;
      if (num !== Number(filing.amount)) onPatch(filing.id, { amount: num });
      else setDraft((p) => ({ ...p, amount: String(Number(filing.amount)) }));
      return;
    }
    const val = raw.trim() || null;
    if (val !== filing[key]) onPatch(filing.id, { [key]: val });
  }

  function fieldHandlers(key: Parameters<typeof commitField>[0]) {
    return {
      value: draft[key],
      onFocus: () => {
        editingRef.current = key;
      },
      onBlur: () => {
        editingRef.current = null;
        commitField(key);
      },
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDraft((p) => ({ ...p, [key]: e.target.value })),
    };
  }

  return (
    <div className="card space-y-3">
      <div className="grid grid-cols-2 gap-x-2 gap-y-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.85fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_auto] lg:items-end lg:gap-x-3">
        <div className="order-1 lg:order-none">
          <label className="label">แบบฟอร์ม</label>
          <input
            className="input"
            list="form-presets"
            placeholder="ภ.พ.30"
            {...fieldHandlers("form_code")}
          />
        </div>
        <div className="order-2 lg:order-none">
          <label className="label">จำนวนเงิน</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            {...fieldHandlers("amount")}
          />
        </div>
        <div className="order-3 col-span-2 lg:order-none lg:col-span-1">
          <label className="label">รายละเอียด</label>
          <input
            className="input"
            {...fieldHandlers("description")}
          />
        </div>
        <div className="order-4 lg:order-none">
          <label className="label">วิธีชำระ</label>
          <input
            className="input"
            placeholder="เช่น สลิป หน้า 2"
            {...fieldHandlers("payment_method")}
          />
        </div>
        <div className="order-5 col-span-2 lg:order-none lg:col-span-1">
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
        <button
          className="btn-danger order-6 justify-self-end self-end lg:order-none"
          onClick={onDelete}
        >
          ลบ
        </button>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}
