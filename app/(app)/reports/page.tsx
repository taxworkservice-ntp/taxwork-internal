"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ATTACHMENT_KIND_LABELS,
  buildMonthlyReportPdf,
  fetchAttachmentBytes,
  type ReportFiling,
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
  qr_path: string | null;
  qr_mime_type: string | null;
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
  covers?: string[];
};

type Filing = {
  id: string;
  client_id: string;
  period_label: string;
  form_code: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  remark: string | null;
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

function shiftYmdMonth(ymd: string, delta: number): string | null {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const daysInMonth = new Date(ny, nm, 0).getDate();
  const nd = Math.min(d, daysInMonth);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ny}-${pad(nm)}-${pad(nd)}`;
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
  const supabase = useMemo(() => createClient(), []);
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
  const [newDueDate, setNewDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [copyingFrom, setCopyingFrom] = useState(false);
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

  const [slipPanelFor, setSlipPanelFor] = useState<string | null>(null);
  const [slipCovers, setSlipCovers] = useState<Set<string>>(new Set());

  function openSlipPanel(filingId: string) {
    setSlipPanelFor(filingId);
    setSlipCovers(new Set([filingId]));
  }

  function toggleSlipCover(filingId: string) {
    setSlipCovers((prev) => {
      const next = new Set(prev);
      if (next.has(filingId)) {
        if (next.size > 1) next.delete(filingId);
      } else {
        next.add(filingId);
      }
      return next;
    });
  }

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
      setLoadedKey(null);
      return;
    }
    const key = `${clientId}|${period}`;
    setLoadedKey((k) => (k === key ? k : null));
    setLoading(true);
    loadSeq.current += 1;
    const seq = loadSeq.current;
    const { data, error } = await supabase
      .from("monthly_filings")
      .select("*,filing_attachments!filing_attachments_filing_id_fkey(*)")
      .eq("client_id", clientId)
      .eq("period_label", period)
      .order("sort_order")
      .order("created_at");
    if (error) {
      console.error("loadFilings failed:", error);
      setStatus(`โหลดรายการไม่สำเร็จ: ${error.message}`);
      setFilings([]);
      setLoadedKey(key);
      setLoading(false);
      return;
    }
    if (seq !== loadSeq.current) return;
    const ordered = (data ?? []) as Filing[];
    if (ordered.length) {
      const { data: links } = await supabase
        .from("attachment_filings")
        .select("attachment_id, filing_id")
        .in(
          "filing_id",
          ordered.map((f) => f.id)
        );
      if (seq !== loadSeq.current) return;
      const coverMap = new Map<string, Set<string>>();
      for (const link of links ?? []) {
        if (!coverMap.has(link.attachment_id))
          coverMap.set(link.attachment_id, new Set());
        coverMap.get(link.attachment_id)!.add(link.filing_id);
      }
      for (const f of ordered) {
        f.filing_attachments?.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        );
        for (const att of f.filing_attachments ?? []) {
          const set = coverMap.get(att.id);
          set?.add(att.filing_id);
          att.covers = Array.from(set ?? [att.filing_id]);
        }
      }
    }
    setFilings(ordered);
    setLoadedKey(key);
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("company_logo_path, company_logo_file_name")
        .eq("id", 1)
        .maybeSingle();
      setLogoPath((data as { company_logo_path: string | null } | null)?.company_logo_path ?? null);
      setLogoFileName(
        (data as { company_logo_file_name: string | null } | null)
          ?.company_logo_file_name ?? null
      );
      setSettingsLoading(false);
    })();
  }, [supabase]);

  async function saveSettingsLogo(path: string | null, fileName: string | null) {
    const { error } = await supabase.from("app_settings").upsert({
      id: 1,
      company_logo_path: path,
      company_logo_file_name: fileName,
      updated_at: new Date().toISOString(),
    });
    if (error) alert(`บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`);
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

  async function copyFromLastMonth() {
    if (!clientId) return;
    const prevPeriod = shiftPeriod(period, -1);
    if (
      filings.length &&
      !confirm(
        `มีรายการอยู่แล้ว ${filings.length} รายการ — คัดลอกจาก ${periodToThai(prevPeriod)} เพิ่มเข้าไปหรือไม่? (รายการเดิมจะไม่ถูกลบ)`
      )
    )
      return;
    setCopyingFrom(true);
    try {
      const { data, error } = await supabase
        .from("monthly_filings")
        .select(
          "form_code, description, amount, due_date, bank_account_id, sort_order"
        )
        .eq("client_id", clientId)
        .eq("period_label", prevPeriod)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      if (!data?.length) {
        alert(`ไม่พบรายการของ ${periodToThai(prevPeriod)} สำหรับลูกค้านี้`);
        return;
      }
      const maxSort = filings.reduce((m, f) => Math.max(m, f.sort_order), 0);
      const { data: inserted, error: insError } = await supabase
        .from("monthly_filings")
        .insert(
          data.map((f, i) => ({
            client_id: clientId,
            period_label: period,
            form_code: f.form_code,
            description: f.description,
            amount: Number(f.amount ?? 0),
            due_date: f.due_date ? shiftYmdMonth(String(f.due_date), 1) : null,
            bank_account_id: f.bank_account_id,
            sort_order: maxSort + i + 1,
          }))
        )
        .select();
      if (insError) throw insError;
      setFilings((prev) => [
        ...prev,
        ...((inserted ?? []) as unknown as Filing[]).map((f) => ({
          ...f,
          filing_attachments: [],
        })),
      ]);
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
    for (const att of filing.filing_attachments) {
      await deleteR2Object(att.storage_path);
    }
    await supabase.from("monthly_filings").delete().eq("id", filing.id);
    loadFilings();
  }

  async function uploadAttachment(
    filingId: string,
    kind: Attachment["kind"],
    file: File,
    covers?: string[]
  ) {
    let path: string;
    try {
      path = await uploadObject(file.name, file);
    } catch (err) {
      alert(`อัปโหลดไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const { data: inserted, error } = await supabase
      .from("filing_attachments")
      .insert({
        filing_id: filingId,
        kind,
        storage_path: path,
        file_name: file.name,
        size_bytes: file.size,
        mime_type: file.type || null,
      })
      .select("id")
      .single();
    if (error) {
      alert(`บันทึกไม่สำเร็จ: ${error.message}`);
      loadFilings();
      return;
    }
    const extras = (covers ?? []).filter((cid) => cid !== filingId);
    if (kind === "slip" && extras.length && inserted) {
      const { error: linkError } = await supabase
        .from("attachment_filings")
        .insert(
          extras.map((fid) => ({ attachment_id: inserted.id, filing_id: fid }))
        );
      if (linkError) alert(`ผูกฟอร์มไม่สำเร็จ: ${linkError.message}`);
    }
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
    const bank = bankAccounts.find((b) => b.id === id);
    if (bank?.qr_path) deleteR2Object(bank.qr_path);
    await supabase.from("bank_accounts").delete().eq("id", id);
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
      const { error } = await supabase
        .from("bank_accounts")
        .update({ qr_path: path })
        .eq("id", bankId);
      if (error) throw error;
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
      await supabase
        .from("bank_accounts")
        .update({ qr_path: null })
        .eq("id", bankId);
      deleteR2Object(bank.qr_path);
    } finally {
      setQrBusyId(null);
    }
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
      const filingById = new Map(filings.map((f) => [f.id, f]));
      const enriched: ReportFiling[] = [];

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

      for (const f of filings) {
        const attachments = [];
        for (const att of f.filing_attachments) {
          const bytes = await fetchAttachmentBytes(att.storage_path);
          const coveredFilings = (att.covers?.length
            ? att.covers
            : [f.id]
          )
            .map((cid) => filingById.get(cid))
            .filter((cf): cf is Filing => Boolean(cf));
          attachments.push({
            kind: att.kind as string,
            file_name: att.file_name,
            mime_type: att.mime_type,
            bytes,
            covered_forms: [
              ...new Set(coveredFilings.map((cf) => cf.form_code)),
            ],
            covered_amount: coveredFilings.reduce(
              (sum, cf) => sum + Number(cf.amount ?? 0),
              0
            ),
            covered_filings: [
              ...new Set(
                (att.covers?.length ? att.covers : [f.id]).filter(
                  (cid) => filingById.has(cid)
                )
              ),
            ],
          });
        }
        const ba = bankAccounts.find((b) => b.id === f.bank_account_id);
        enriched.push({
          id: f.id,
          form_code: f.form_code,
          description: f.description,
          amount: Number(f.amount ?? 0),
          due_date: f.due_date,
          remark: f.remark ?? null,
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
          attachments,
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
          <button
            className="btn px-2.5"
            title="คัดลอกรายการจากเดือนก่อน"
            aria-label="คัดลอกรายการจากเดือนก่อน"
            onClick={copyFromLastMonth}
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
              รายการงานภาษี ประจำเดือน {periodToThai(period)}
            </h2>

            <div className="card grid grid-cols-2 gap-x-2 gap-y-3 lg:grid-cols-[150px_minmax(0,1.7fr)_135px_170px_auto] lg:items-end lg:gap-x-3">
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
                  {FORM_PRESETS.map((p) => (
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
                <label className="label">กำหนดชำระ</label>
                <input
                  className="input"
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
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
                  allFilings={filings}
                  bankAccounts={bankAccounts}
                  onPatch={patchFiling}
                  onDelete={() => deleteFiling(f)}
                  onUpload={(kind, file) =>
                    uploadAttachment(f.id, kind, file)
                  }
                  onDeleteAttachment={deleteAttachment}
                  slipOpen={slipPanelFor === f.id}
                  slipCovers={slipCovers}
                  onOpenSlipPanel={() => openSlipPanel(f.id)}
                  onCloseSlipPanel={() => setSlipPanelFor(null)}
                  onToggleSlipCover={toggleSlipCover}
                  onSlipFiles={(files) =>
                    files.forEach((file) =>
                      uploadAttachment(f.id, "slip", file, [...slipCovers])
                    )
                  }
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
  allFilings,
  bankAccounts,
  onPatch,
  onDelete,
  onUpload,
  onDeleteAttachment,
  slipOpen,
  slipCovers,
  onOpenSlipPanel,
  onCloseSlipPanel,
  onToggleSlipCover,
  onSlipFiles,
}: {
  filing: Filing;
  allFilings: Filing[];
  bankAccounts: BankAccount[];
  onPatch: (id: string, patch: Partial<Filing>) => void;
  onDelete: () => void;
  onUpload: (kind: Attachment["kind"], file: File) => void;
  onDeleteAttachment: (att: Attachment) => void;
  slipOpen: boolean;
  slipCovers: Set<string>;
  onOpenSlipPanel: () => void;
  onCloseSlipPanel: () => void;
  onToggleSlipCover: (filingId: string) => void;
  onSlipFiles: (files: File[]) => void;
}) {
  const editingRef = useRef<string | null>(null);
  const [draft, setDraft] = useState({
    form_code: filing.form_code,
    description: filing.description ?? "",
    amount: String(Number(filing.amount)),
    due_date: filing.due_date ?? "",
    remark: filing.remark ?? "",
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
      due_date:
        prev.due_date !== (filing.due_date ?? "") &&
        editingRef.current === "due_date"
          ? prev.due_date
          : filing.due_date ?? "",
      remark:
        prev.remark !== (filing.remark ?? "") &&
        editingRef.current === "remark"
          ? prev.remark
          : filing.remark ?? "",
    }));
  }, [filing]);

  function commitField(
    key: "form_code" | "description" | "amount" | "due_date" | "remark"
  ) {
    const raw = draft[key];
    if (key === "amount") {
      const num = Number(raw) || 0;
      if (num !== Number(filing.amount)) onPatch(filing.id, { amount: num });
      else setDraft((p) => ({ ...p, amount: String(Number(filing.amount)) }));
      return;
    }
    if (key === "due_date") {
      const val = raw || null;
      if (val !== filing.due_date) onPatch(filing.id, { due_date: val });
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
      <div className="grid grid-cols-2 gap-x-2 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.85fr)_minmax(0,1.05fr)_minmax(0,1.45fr)_minmax(0,0.95fr)_auto] lg:items-end lg:gap-x-3">
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
          <label className="label">กำหนดชำระ</label>
          <input
            className="input"
            type="date"
            {...fieldHandlers("due_date")}
          />
        </div>
        <div className="order-5 lg:order-none">
          <label className="label">หมายเหตุ</label>
          <input
            className="input"
            placeholder="หมายเหตุ"
            {...fieldHandlers("remark")}
          />
        </div>
        <div className="order-6 col-span-2 lg:order-none lg:col-span-1">
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
          className="btn-danger order-7 justify-self-end self-end lg:order-none"
          onClick={onDelete}
        >
          ลบ
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
        {(["slip", "qr", "document"] as const).map((kind) => (
          <label
            key={kind}
            className="btn cursor-pointer text-xs"
            onClick={
              kind === "slip"
                ? (e) => {
                    e.preventDefault();
                    if (slipOpen) onCloseSlipPanel();
                    else onOpenSlipPanel();
                  }
                : undefined
            }
          >
            + {ATTACHMENT_KIND_LABELS[kind]}
            {kind !== "slip" && (
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
            )}
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
                {att.covers && att.covers.length > 1 && (
                  <span className="text-blue-600">
                    ·{att.covers.length} ฟอร์ม
                  </span>
                )}
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

      {slipOpen && (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium">
              สลิปนี้ชำระสำหรับฟอร์มใด (เลือกได้หลายฟอร์ม):
            </p>
            <button
              className="text-xs text-neutral-400 hover:text-neutral-700"
              onClick={onCloseSlipPanel}
            >
              ยกเลิก ✕
            </button>
          </div>
          <div className="mb-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {allFilings.map((pf) => (
              <label
                key={pf.id}
                className="flex items-center gap-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={slipCovers.has(pf.id)}
                  onChange={() => onToggleSlipCover(pf.id)}
                />
                <span className={pf.id === filing.id ? "font-medium" : ""}>
                  {[pf.form_code, pf.description].filter(Boolean).join(" – ") ||
                    "-"}
                  {` (${fmtMoney(Number(pf.amount))})`}
                </span>
              </label>
            ))}
          </div>
          <label className="btn inline-flex cursor-pointer text-xs">
            เลือกไฟล์สลิป...
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,.pdf"
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (!list?.length) return;
                onSlipFiles(Array.from(list));
                e.target.value = "";
                onCloseSlipPanel();
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function truncateName(name: string, max = 28) {
  return name.length > max ? `${name.slice(0, max)}…` : name;
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
