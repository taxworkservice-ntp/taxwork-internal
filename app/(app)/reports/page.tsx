"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addAttachment,
  addBankAccount as addBankAccountAction,
  addFiling as addFilingAction,
  addReportDocument,
  clearFilings,
  clearReportDocuments,
  copyReportToNewIssue,
  createMonthlyReport,
  createReportShareLink,
  deleteMonthlyReport,
  deleteAttachment,
  deleteReportDocument,
  deleteBankAccount as deleteBankAccountAction,
  deleteFiling as deleteFilingAction,
  ensureDefaultRounds,
  getAppSettings,
  getReportShare,
  revokeReportShareLink,
  deleteCustomPaymentMethod as deleteCustomPaymentMethodAction,
  issueMonthlyReport,
  listActiveClients,
  listBankAccounts,
  listCustomFormCodes,
  listCustomPaymentMethods,
  listMonthlyReports,
  listReportFiles,
  listReportDocuments,
  loadFilings as loadFilingsAction,
  patchFiling as patchFilingAction,
  recordReportFile,
  rememberFormCode as rememberFormCodeAction,
  rememberPaymentMethod as rememberPaymentMethodAction,
  reopenMonthlyReport,
  reorderReportDocuments,
  saveAppSettings,
  saveReportBranding,
  setBankLogo,
  setBankQr,
  type Attachment,
  type BankAccount,
  type ClientRow,
  type Filing,
  type MonthlyReport,
  type ReportDocument as SavedDocument,
  type ReportFile,
  type ReportShare,
} from "@/lib/actions/reports";
import {
  buildMonthlyReportPdf,
  fetchAttachmentBytes,
  type ReportAttachment,
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

// Reports are issued for the previous month (e.g. in September you file August).
function defaultPeriod(): string {
  const d = new Date();
  const total = d.getFullYear() * 12 + d.getMonth() - 1;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
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

/** Strip grouping/commas and non-numeric chars, returning a clean number string. */
function parseAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const intPart = parts[0] ?? "";
  const decPart = parts.length > 1 ? parts[1].slice(0, 2) : null;
  const out = decPart === null ? intPart : `${intPart}.${decPart}`;
  return out;
}

/** Amount for display: thousands-separated, 2 decimals (e.g. "1,001.33"). */
function fmtAmountInput(raw: string): string {
  const n = Number(parseAmountInput(raw) || "0");
  return fmtMoney(n);
}

function fmtSize(bytes: number): string {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function ReportsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState(defaultPeriod());
  const [filings, setFilings] = useState<Filing[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [activeReportId, setActiveReportId] = useState("");
  const [newRoundSeq, setNewRoundSeq] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
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
  const [customPayMethods, setCustomPayMethods] = useState<string[]>([]);
  const [newPayMethodPreset, setNewPayMethodPreset] = useState("");
  const [reportFiles, setReportFiles] = useState<ReportFile[]>([]);
  const [share, setShare] = useState<ReportShare | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const ensuredRoundsRef = useRef<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [qrBusyId, setQrBusyId] = useState<string | null>(null);
  const [logoBusyId, setLogoBusyId] = useState<string | null>(null);
  const [qrFilingId, setQrFilingId] = useState<string | null>(null);
  const [slipFilingId, setSlipFilingId] = useState<string | null>(null);
  const [firmName, setFirmName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [coverStyle, setCoverStyle] = useState<"modern" | "classic">("modern");
  const [reportRenderer, setReportRenderer] = useState<"legacy" | "server">("legacy");
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const [bankLabel, setBankLabel] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankNo, setBankNo] = useState("");
  const [bankAcctName, setBankAcctName] = useState("");
  const [bankPromptpay, setBankPromptpay] = useState("");

  // Part 2: ordered documents (persisted per round; upload order = PDF order)
  const [docs, setDocs] = useState<SavedDocument[]>([]);
  const [docsDragActive, setDocsDragActive] = useState(false);
  const [docsBusy, setDocsBusy] = useState(false);
  const docsInputRef = useRef<HTMLInputElement>(null);

  async function refreshDocs(reportId = activeReportId) {
    if (!reportId) {
      setDocs([]);
      return;
    }
    try {
      setDocs(await listReportDocuments(reportId));
    } catch {
      setDocs([]);
    }
  }

  async function addDocs(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length || !activeReportId || reportLocked) return;
    setDocsBusy(true);
    try {
      let order = docs.length;
      for (const file of list) {
        const path = await uploadObject(file.name, file);
        order += 1;
        await addReportDocument(activeReportId, {
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
          sort_order: order,
        });
      }
      await refreshDocs();
    } catch (err) {
      alert(`อัปโหลดเอกสารไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setDocsBusy(false);
      if (docsInputRef.current) docsInputRef.current.value = "";
    }
  }

  async function moveDoc(id: string, delta: -1 | 1) {
    const i = docs.findIndex((d) => d.id === id);
    const j = i + delta;
    if (!activeReportId || i < 0 || j < 0 || j >= docs.length) return;
    const next = [...docs];
    [next[i], next[j]] = [next[j], next[i]];
    setDocs(next);
    try {
      await reorderReportDocuments(
        activeReportId,
        next.map((d) => d.id)
      );
    } catch (err) {
      alert(`จัดลำดับไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      await refreshDocs();
    }
  }

  async function removeDoc(id: string) {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    try {
      await deleteR2Object(doc.storage_path);
      await deleteReportDocument(doc.id);
      await refreshDocs();
    } catch (err) {
      alert(`ลบเอกสารไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function clearDocs() {
    if (!activeReportId || !docs.length) return;
    if (!confirm(`ล้างเอกสารทั้งหมด ${docs.length} ไฟล์?`)) return;
    setDocsBusy(true);
    try {
      for (const d of docs) await deleteR2Object(d.storage_path);
      await clearReportDocuments(activeReportId);
      await refreshDocs();
    } catch (err) {
      alert(`ล้างเอกสารไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setDocsBusy(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [codes, methods] = await Promise.all([
          listCustomFormCodes(),
          listCustomPaymentMethods(),
        ]);
        setCustomFormCodes(codes);
        setCustomPayMethods(methods);
      } catch (error) {
        console.error("load presets failed:", error);
      }
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

  const payMethodPresetList = useMemo(
    () => [...customPayMethods].sort((a, b) => a.localeCompare(b, "th")),
    [customPayMethods]
  );

  function rememberPaymentMethod(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setCustomPayMethods((prev) =>
      prev.includes(code) ? prev : [...prev, code]
    );
    rememberPaymentMethodAction(code).catch((err) => {
      console.error("save payment method failed:", err);
    });
  }

  async function addPayMethodPreset() {
    const code = newPayMethodPreset.trim();
    if (!code) return;
    setNewPayMethodPreset("");
    rememberPaymentMethod(code);
  }

  async function removePayMethodPreset(code: string) {
    if (!confirm(`ลบวิธีชำระ "${code}" ออกจากตัวเลือก?`)) return;
    setCustomPayMethods((prev) => prev.filter((p) => p !== code));
    try {
      await deleteCustomPaymentMethodAction(code);
    } catch (err) {
      alert(`ลบไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      setCustomPayMethods(await listCustomPaymentMethods());
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    (async () => {
      try {
        const [clientRows, bankRows] = await Promise.all([
          listActiveClients(),
          listBankAccounts(),
        ]);
        const sorted = [...clientRows].sort((a, b) =>
          a.name.localeCompare(b.name, "th")
        );
        setClients(sorted);
        setBankAccounts(bankRows);
      } catch (error) {
        console.error("load clients/banks failed:", error);
        setStatus(
          `โหลดข้อมูลลูกค้า/บัญชีไม่สำเร็จ: ${error instanceof Error ? error.message : error}`
        );
      }
    })();
  }, []);

  const loadReports = useCallback(async () => {
    if (!clientId) {
      setReports([]);
      setActiveReportId("");
      return;
    }
    setReportsLoading(true);
    try {
      let rows = await listMonthlyReports(clientId, period);
      // A fresh month starts with the default rounds (1 & 2), each seeded from
      // the nearest earlier month's same round (no amounts/files). Runs once
      // per client+month and only while the month has no rounds yet.
      if (!rows.length) {
        const key = `${clientId}|${period}`;
        if (ensuredRoundsRef.current !== key) {
          ensuredRoundsRef.current = key;
          try {
            await ensureDefaultRounds(clientId, period);
            rows = await listMonthlyReports(clientId, period);
          } catch (error) {
            ensuredRoundsRef.current = null; // allow a retry on the next load
            console.error("ensureDefaultRounds failed:", error);
            setStatus(
              `สร้างรอบเริ่มต้นไม่สำเร็จ: ${error instanceof Error ? error.message : error}`
            );
          }
        }
      }
      setReports(rows);
      setActiveReportId((prev) =>
        rows.some((r) => r.id === prev) ? prev : rows.length ? rows[rows.length - 1].id : ""
      );
    } catch (error) {
      console.error("loadReports failed:", error);
      setStatus(`โหลดรอบรายงานไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
      setReports([]);
      setActiveReportId("");
    } finally {
      setReportsLoading(false);
    }
  }, [clientId, period]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const loadFilings = useCallback(async () => {
    if (!clientId || !activeReportId) {
      setFilings([]);
      setLoadedKey(null);
      return;
    }
    const key = `${clientId}|${period}|${activeReportId}`;
    setLoadedKey((k) => (k === key ? k : null));
    setLoading(true);
    loadSeq.current += 1;
    const seq = loadSeq.current;
    try {
      const ordered = await loadFilingsAction(clientId, period, activeReportId);
      if (seq !== loadSeq.current) return;
      setFilings(ordered);
    } catch (error) {
      console.error("loadFilings failed:", error);
      setStatus(`โหลดรายการไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
      setFilings([]);
    }
    setLoadedKey(key);
    setLoading(false);
  }, [clientId, period, activeReportId]);

  useEffect(() => {
    loadFilings();
  }, [loadFilings]);

  // Load persisted Part 2 documents for the active round.
  useEffect(() => {
    let cancelled = false;
    if (!activeReportId) {
      setDocs([]);
      return;
    }
    setDocs([]);
    listReportDocuments(activeReportId)
      .then((rows) => {
        if (!cancelled) setDocs(rows);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeReportId]);

  // Saved report copies (history) for the active round.
  useEffect(() => {
    let cancelled = false;
    if (!activeReportId) {
      setReportFiles([]);
      return;
    }
    setReportFiles([]);
    listReportFiles(activeReportId)
      .then((rows) => {
        if (!cancelled) setReportFiles(rows);
      })
      .catch((error) => {
        if (!cancelled)
          setStatus(
            `โหลดประวัติไฟล์รายงานไม่สำเร็จ: ${error instanceof Error ? error.message : error}`
          );
      });
    return () => {
      cancelled = true;
    };
  }, [activeReportId]);

  // Active share link for the round.
  useEffect(() => {
    let cancelled = false;
    if (!activeReportId) {
      setShare(null);
      return;
    }
    getReportShare(activeReportId)
      .then((s) => {
        if (!cancelled) setShare(s);
      })
      .catch(() => {
        if (!cancelled) setShare(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeReportId]);

  const reloadBanks = useCallback(async () => {
    setBankAccounts(await listBankAccounts());
     
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await getAppSettings();
        if (!res.ok) {
          console.error("load settings failed:", res.error);
          setStatus(`โหลดการตั้งค่ารายงานไม่สำเร็จ: ${res.error}`);
          return;
        }
        const data = res.settings;
        setLogoPath(data?.company_logo_path ?? null);
        setLogoFileName(data?.company_logo_file_name ?? null);
        setFirmName(data?.firm_name ?? "");
        setPreparedBy(data?.prepared_by ?? "");
        setCoverStyle(data?.cover_style === "classic" ? "classic" : "modern");
        setReportRenderer(data?.report_renderer === "server" ? "server" : "legacy");
      } catch (error) {
        console.error("load settings failed:", error);
        setStatus(
          `โหลดการตั้งค่ารายงานไม่สำเร็จ: ${error instanceof Error ? error.message : error}`
        );
      } finally {
        // Never leave the settings panel stuck on "กำลังโหลด...".
        setSettingsLoading(false);
      }
    })();
  }, []);

  async function saveBranding() {
    setBrandingBusy(true);
    try {
      const res = await saveReportBranding({
        firmName: firmName.trim() || null,
        brandColor: null,
        coverStyle,
        preparedBy: preparedBy.trim() || null,
        reportRenderer,
      });
      if (!res.ok) {
        alert(`บันทึกการตั้งค่าไม่สำเร็จ: ${res.error}`);
      }
    } catch (error) {
      alert(`บันทึกการตั้งค่าไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBrandingBusy(false);
    }
  }

  async function saveSettingsLogo(path: string | null, fileName: string | null) {
    try {
      const res = await saveAppSettings(path, fileName);
      if (!res.ok) {
        alert(`บันทึกการตั้งค่าไม่สำเร็จ: ${res.error}`);
      }
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
  const activeReport = reports.find((r) => r.id === activeReportId) ?? null;
  const nextRoundSeq = (() => {
    const used = new Set(reports.map((r) => r.seq));
    let s = 1;
    while (used.has(s)) s += 1;
    return s;
  })();
  const reportLocked = activeReport?.status === "issued";

  const [copyOffset, setCopyOffset] = useState(1);

  // Copy the previously selected round from an earlier month into a new round here.
  async function copyFromPastMonth() {
    if (!clientId) return;
    const prevPeriod = shiftPeriod(period, -copyOffset);
    if (
      filings.length &&
      !confirm(
        `มีรายการอยู่แล้ว ${filings.length} รายการ — คัดลอกจาก ${periodToThai(prevPeriod)} เป็นรอบใหม่หรือไม่? (รายการเดิมจะไม่ถูกลบ)`
      )
    )
      return;
    setCopyingFrom(true);
    try {
      const prevReports = await listMonthlyReports(clientId, prevPeriod);
      if (!prevReports.length) {
        alert(`ไม่พบรายงานของ ${periodToThai(prevPeriod)} สำหรับลูกค้านี้`);
        return;
      }
      const source = prevReports[prevReports.length - 1];
      const inserted = await copyReportToNewIssue(source.id, clientId, period);
      if (!inserted.length) {
        alert(`ไม่พบรายการของ ${periodToThai(prevPeriod)} สำหรับลูกค้านี้`);
        return;
      }
      const rows = await listMonthlyReports(clientId, period);
      setReports(rows);
      if (rows.length) setActiveReportId(rows[rows.length - 1].id);
      inserted.forEach((f) => {
        rememberFormCode(f.form_code);
        if (f.payment_method) rememberPaymentMethod(f.payment_method);
      });
    } catch (err) {
      alert(`คัดลอกรายการไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setCopyingFrom(false);
    }
  }

  // Copy the latest round of the current month into a new round here.
  async function copyLastRound() {
    if (!clientId) return;
    const latest = reports[reports.length - 1];
    if (!latest) {
      alert(`ไม่พบรอบรายงานของ ${periodToThai(period)} สำหรับลูกค้านี้`);
      return;
    }
    if (
      filings.length &&
      !confirm(
        `มีรายการอยู่แล้ว ${filings.length} รายการ — คัดลอกจาก ${latest.label ?? `ครั้งที่ ${latest.seq}`} เป็นรอบใหม่หรือไม่? (รายการเดิมจะไม่ถูกลบ)`
      )
    )
      return;
    setCopyingFrom(true);
    try {
      const inserted = await copyReportToNewIssue(latest.id, clientId, period);
      if (!inserted.length) {
        alert(`ไม่พบรายการของ ${latest.label ?? `ครั้งที่ ${latest.seq}`}`);
        return;
      }
      const rows = await listMonthlyReports(clientId, period);
      setReports(rows);
      if (rows.length) setActiveReportId(rows[rows.length - 1].id);
      inserted.forEach((f) => {
        rememberFormCode(f.form_code);
        if (f.payment_method) rememberPaymentMethod(f.payment_method);
      });
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
    if (reportLocked) return;
    setAdding(true);
    try {
      let reportId = activeReportId;
      if (!reportId) {
        const res = await createMonthlyReport(clientId, period);
        if (!res.ok) throw new Error(res.error);
        setReports([res.report]);
        setActiveReportId(res.report.id);
        reportId = res.report.id;
      }
      const created = await addFilingAction(clientId, period, reportId, {
        form_code: newFormCode.trim(),
        description: newDescription.trim() || null,
        amount: Number(parseAmountInput(newAmount) || "0"),
        due_date: null,
        payment_method: newPaymentMethod.trim() || null,
      });
      rememberFormCode(newFormCode.trim());
      if (newPaymentMethod.trim()) rememberPaymentMethod(newPaymentMethod);
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
    if (typeof patch.payment_method === "string" && patch.payment_method.trim())
      rememberPaymentMethod(patch.payment_method);
  }

  async function moveFiling(id: string, delta: -1 | 1) {
    if (reportLocked) return;
    const i = filings.findIndex((f) => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= filings.length) return;
    const next = [...filings];
    [next[i], next[j]] = [next[j], next[i]];
    setFilings(next);
    try {
      await Promise.all(
        next.map((f, idx) => patchFilingAction(f.id, { sort_order: idx + 1 }))
      );
    } catch (error) {
      alert(`จัดลำดับไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
      loadFilings();
    }
  }

  async function deleteR2Object(storagePath: string) {
    if (storagePath.startsWith("/")) return; // bundled local asset, not in R2
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

  async function uploadFilingQr(filing: Filing, file: File) {
    if (reportLocked) return;
    setQrFilingId(filing.id);
    try {
      const path = await uploadObject(file.name, file);
      // One QR per filing: drop any existing QR (R2 + DB) before adding.
      for (const att of filing.filing_attachments) {
        if (att.kind !== "qr") continue;
        await deleteR2Object(att.storage_path);
        await deleteAttachment(att.id);
      }
      await addAttachment(
        filing.id,
        "qr",
        {
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
        },
        [filing.id]
      );
      await loadFilings();
    } catch (err) {
      alert(`อัปโหลด QR ไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setQrFilingId(null);
    }
  }

  async function removeFilingQr(att: Attachment) {
    if (reportLocked) return;
    if (!confirm("ลบ QR ของรายการนี้?")) return;
    try {
      await deleteAttachment(att.id);
      await deleteR2Object(att.storage_path);
      await loadFilings();
    } catch (err) {
      alert(`ลบ QR ไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function uploadFilingSlip(filing: Filing, file: File) {
    if (reportLocked) return;
    setSlipFilingId(filing.id);
    try {
      const path = await uploadObject(file.name, file);
      // One slip per filing: drop any existing slip (R2 + DB) before adding.
      for (const att of filing.filing_attachments) {
        if (att.kind !== "slip") continue;
        await deleteR2Object(att.storage_path);
        await deleteAttachment(att.id);
      }
      await addAttachment(
        filing.id,
        "slip",
        {
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
        },
        [filing.id]
      );
      await loadFilings();
    } catch (err) {
      alert(`อัปโหลดสลิปไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSlipFilingId(null);
    }
  }

  async function removeFilingSlip(att: Attachment) {
    if (reportLocked) return;
    if (!confirm("ลบสลิปของรายการนี้?")) return;
    try {
      await deleteAttachment(att.id);
      await deleteR2Object(att.storage_path);
      await loadFilings();
    } catch (err) {
      alert(`ลบสลิปไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function deleteFiling(filing: Filing) {
    if (!confirm(`ลบรายการ "${filing.form_code}" ?`)) return;
    await deleteFilingAction(filing.id);
    loadFilings();
  }

  async function clearAllFilings() {
    if (!clientId || !activeReportId || !filings.length || reportLocked) return;
    if (
      !confirm(
        `ลบรายการทั้งหมด ${filings.length} รายการ ของ ${activeReport?.label ?? periodToThai(period)} ?\nไม่สามารถกู้คืนได้`
      )
    )
      return;
    setClearingAll(true);
    try {
      await clearFilings(activeReportId);
      loadFilings();
    } catch (err) {
      alert(`ลบรายการไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setClearingAll(false);
    }
  }

  async function addReportRound(seqInput?: number) {
    if (!clientId) return;
    setReportBusy(true);
    try {
      const res = await createMonthlyReport(clientId, period, seqInput ?? null);
      if (!res.ok) {
        alert(`เพิ่มรอบรายงานไม่สำเร็จ: ${res.error}`);
        return;
      }
      setReports((prev) =>
        [...prev, res.report].sort((a, b) => a.seq - b.seq)
      );
      setActiveReportId(res.report.id);
    } catch (err) {
      alert(`เพิ่มรอบรายงานไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setReportBusy(false);
    }
  }

  async function removeReportRound(report: MonthlyReport) {
    if (!clientId) return;
    if (reports.length <= 1) {
      alert("ต้องมีอย่างน้อย 1 รอบรายงาน");
      return;
    }
    if (!confirm(`ลบ ${report.label ?? `ครั้งที่ ${report.seq}`} และรายการทั้งหมดในรอบนี้?`)) return;
    setReportBusy(true);
    try {
      await deleteMonthlyReport(report.id);
      await loadReports();
    } catch (err) {
      alert(`ลบรอบรายงานไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setReportBusy(false);
    }
  }

  async function toggleReportIssued(report: MonthlyReport) {
    if (!clientId) return;
    const label = report.label ?? `ครั้งที่ ${report.seq}`;
    if (report.status === "issued") {
      if (!confirm(`เปิดแก้ไข ${label} อีกครั้ง?`)) return;
      setReportBusy(true);
      try {
        await reopenMonthlyReport(report.id);
        await loadReports();
      } catch (err) {
        alert(`เปลี่ยนสถานะไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      } finally {
        setReportBusy(false);
      }
      return;
    }

    if (
      !confirm(
        `ออกรายงาน ${report.report_no ?? label} — จะล็อกไม่ให้แก้ไข และบันทึกไฟล์ PDF ลงประวัติ ใช่หรือไม่?`
      )
    )
      return;

    setReportBusy(true);
    try {
      await issueMonthlyReport(report.id);
      await loadReports();
    } catch (err) {
      alert(`เปลี่ยนสถานะไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      setReportBusy(false);
      return;
    }
    setReportBusy(false);

    // Archive a PDF copy to history (no device download). Best-effort: the
    // round stays issued even if generation fails.
    if (selectedClient && report.id === activeReportId && filings.length) {
      setGenerating(true);
      try {
        await buildAndArchiveReportPdf({ download: false });
        setStatus("ออกรายงานแล้ว — บันทึกไฟล์ PDF ลงประวัติเรียบร้อย");
      } catch (err) {
        setStatus(
          `ออกรายงานแล้ว แต่บันทึกไฟล์ PDF ไม่สำเร็จ: ${err instanceof Error ? err.message : err}`
        );
      } finally {
        setGenerating(false);
      }
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
    if (bank?.logo_path) deleteR2Object(bank.logo_path);
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
      await setBankQr(bankId, path).then((res) => {
        if (!res.ok) throw new Error(res.error);
      });
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
      const res = await setBankQr(bankId, null);
      if (!res.ok) throw new Error(res.error);
      deleteR2Object(bank.qr_path);
    } catch (err) {
      alert(`ลบ QR ไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      reloadBanks();
    } finally {
      setQrBusyId(null);
    }
  }

  type LogoSlot = "top" | "bottom";

  async function handleBankLogoUpload(
    bankId: string,
    slot: LogoSlot,
    file: File
  ) {
    setLogoBusyId(`${bankId}:${slot}`);
    try {
      const path = await uploadObject(file.name, file);
      const bank = bankAccounts.find((b) => b.id === bankId);
      const oldPath = slot === "bottom" ? bank?.logo_bottom_path : bank?.logo_path;
      setBankAccounts((prev) =>
        prev.map((b) =>
          b.id === bankId
            ? slot === "bottom"
              ? {
                  ...b,
                  logo_bottom_path: path,
                  logo_bottom_mime_type: file.type || null,
                }
              : { ...b, logo_path: path, logo_mime_type: file.type || null }
            : b
        )
      );
      await setBankLogo(bankId, slot, path, file.type || null).then((res) => {
        if (!res.ok) throw new Error(res.error);
      });
      if (oldPath && oldPath !== path) deleteR2Object(oldPath);
    } catch (err) {
      alert(`อัปโหลดโลโก้ธนาคารไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      reloadBanks();
    } finally {
      setLogoBusyId(null);
    }
  }

  async function handleBankLogoRemove(bankId: string, slot: LogoSlot) {
    const bank = bankAccounts.find((b) => b.id === bankId);
    const oldPath = slot === "bottom" ? bank?.logo_bottom_path : bank?.logo_path;
    if (
      !oldPath ||
      !confirm(`ลบโลโก้ ${slot === "bottom" ? "2" : "1"} ของบัญชีนี้?`)
    )
      return;
    setLogoBusyId(`${bankId}:${slot}`);
    try {
      setBankAccounts((prev) =>
        prev.map((b) =>
          b.id === bankId
            ? slot === "bottom"
              ? { ...b, logo_bottom_path: null, logo_bottom_mime_type: null }
              : { ...b, logo_path: null, logo_mime_type: null }
            : b
        )
      );
      const res = await setBankLogo(bankId, slot, null, null);
      if (!res.ok) throw new Error(res.error);
      deleteR2Object(oldPath);
    } catch (err) {
      alert(`ลบโลโก้ไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
      reloadBanks();
    } finally {
      setLogoBusyId(null);
    }
  }

  async function collectReportOptions(preview: boolean) {
    if (!selectedClient) throw new Error("ยังไม่ได้เลือกลูกค้า");

    // Part 1: cover rows (no per-filing files anymore)
    const usedBanks = new Set(
      filings
        .map((f) => f.bank_account_id)
        .filter((id): id is string => Boolean(id))
    );
    const bankQrCache = new Map<string, ArrayBuffer | null>();
    const bankLogoCache = new Map<string, ArrayBuffer | null>();
    const bankLogoBottomCache = new Map<string, ArrayBuffer | null>();
    for (const bankId of usedBanks) {
      const bank = bankAccounts.find((b) => b.id === bankId);
      // Logos are small — include them in previews too.
      for (const [path, cache] of [
        [bank?.logo_path, bankLogoCache],
        [bank?.logo_bottom_path, bankLogoBottomCache],
      ] as const) {
        if (!path) continue;
        try {
          cache.set(bankId, await fetchAttachmentBytes(path));
        } catch {
          cache.set(bankId, null);
        }
      }
      // QR renders on the modern cover cards, so previews need it too.
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

    const enriched: ReportFiling[] = await Promise.all(
      filings.map(async (f) => {
        const ba = bankAccounts.find((b) => b.id === f.bank_account_id);
        // Per-filing QR uploaded for this round; the bank QR is only fallback.
        const attachments: ReportAttachment[] = [];
        for (const att of f.filing_attachments) {
          if (att.kind !== "qr") continue;
          try {
            attachments.push({
              kind: "qr",
              file_name: att.file_name,
              mime_type: att.mime_type,
              bytes: await fetchAttachmentBytes(att.storage_path),
            });
          } catch {
            // ignore unreadable QR — fall back to the bank QR, if any
          }
        }
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
                id: ba.id,
                label: ba.label,
                bank_name: ba.bank_name,
                account_no: ba.account_no,
                account_name: ba.account_name,
                promptpay_id: ba.promptpay_id,
                qr_bytes: bankQrCache.get(ba.id) ?? null,
                logo_bytes: bankLogoCache.get(ba.id) ?? null,
                logo_bottom_bytes: bankLogoBottomCache.get(ba.id) ?? null,
              }
            : null,
          attachments,
        };
      })
    );

    // Part 2: ordered documents (persisted), upload order = PDF order
    const documents: ReportDocument[] = [];
    if (!preview) {
      for (const d of docs) {
        try {
          documents.push({
            file_name: d.file_name,
            mime_type: d.mime_type,
            bytes: await fetchAttachmentBytes(d.storage_path),
          });
        } catch {
          // skip unreadable document
        }
      }
    }

    let logoBytes: ArrayBuffer | null = null;
    if (logoPath) {
      try {
        logoBytes = await fetchAttachmentBytes(logoPath);
      } catch {
        logoBytes = null;
      }
    }

    return {
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
      firmName: firmName.trim() || undefined,
      preparedBy: preparedBy.trim() || undefined,
      coverStyle,
      preview,
      reportNo: activeReport?.report_no ?? undefined,
      reportLabel: activeReport?.label ?? undefined,
    };
  }

  async function renderServerPdf(preview: boolean): Promise<Uint8Array> {
    if (!activeReportId) throw new Error("ยังไม่ได้เลือกรอบรายงาน");
    const res = await fetch("/api/reports/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: activeReportId, preview }),
    });
    if (!res.ok) {
      let message = `สร้างไฟล์ไม่สำเร็จ (HTTP ${res.status})`;
      try {
        const j = await res.json();
        if (j?.error) message = String(j.error);
      } catch {
        // keep default message
      }
      throw new Error(message);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async function previewCover() {
    if (!selectedClient || !activeReportId || !filings.length) return;
    setPreviewBusy(true);
    setStatus("");
    try {
      const pdfBytes =
        reportRenderer === "server"
          ? await renderServerPdf(true)
          : await buildMonthlyReportPdf(await collectReportOptions(true));
      const blob = new Blob([new Uint8Array(pdfBytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPreviewOpen(true);
    } catch (err) {
      alert(`ดูตัวอย่างไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setPreviewBusy(false);
    }
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function downloadReportFile(file: ReportFile) {
    setDownloadingId(file.id);
    try {
      const res = await fetch("/api/files/sign-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: file.storage_path }),
      });
      if (!res.ok) throw new Error("ขอลิงก์ดาวน์โหลดไม่สำเร็จ");
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch (err) {
      alert(`ดาวน์โหลดไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    } finally {
      setDownloadingId(null);
    }
  }

  async function createShareLink() {
    if (!activeReportId) return;
    setShareBusy(true);
    setStatus("");
    try {
      const res = await createReportShareLink(activeReportId, 30);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setShare(res.share);
      if (res.share) {
        await navigator.clipboard.writeText(res.share.url).catch(() => undefined);
        setStatus("สร้างลิงก์แชร์แล้ว (คัดลอกไปวางใน LINE ได้เลย)");
      }
    } catch (error) {
      alert(`สร้างลิงก์ไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShareLink() {
    if (!activeReportId || !confirm("ยกเลิกลิงก์แชร์นี้?")) return;
    setShareBusy(true);
    try {
      const res = await revokeReportShareLink(activeReportId);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setShare(null);
    } finally {
      setShareBusy(false);
    }
  }

  /**
   * Build the report PDF and archive a copy to R2 + the files history.
   * Optionally also download it to the device (used by "ดาวน์โหลด PDF").
   * Assumes the active round already has its final report_no/status.
   */
  async function buildAndArchiveReportPdf({
    download,
  }: {
    download: boolean;
  }): Promise<void> {
    if (!selectedClient || !activeReportId) throw new Error("ยังไม่ได้เลือกรอบรายงาน");
    const pdfBytes =
      reportRenderer === "server"
        ? await renderServerPdf(false)
        : await buildMonthlyReportPdf(await collectReportOptions(false));

    const seq = activeReport?.seq ?? 1;
    const publicId = activeReport?.public_id ?? String(Date.now());
    const roundTag = `-ครั้งที่${seq}`;
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });

    if (download) {
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `รายงานภาษี-${selectedClient.name}-${period}${roundTag}.pdf`;
      a.click();
      URL.revokeObjectURL(dlUrl);
    }

    const signRes = await fetch("/api/files/sign-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        fileName: `monthly-report-${period}-${seq}-${publicId}.pdf`,
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
      activeReportId,
      path,
      `รายงานภาษี ${periodToThai(period)} ${activeReport?.label ?? ""}.pdf`.trim(),
      blob.size
    );

    listReportFiles(activeReportId)
      .then(setReportFiles)
      .catch(() => undefined);
  }

  async function generatePdf() {
    if (!selectedClient || !activeReportId || !filings.length) return;
    if (
      !confirm(
        `สร้างรายงาน ${periodToThai(period)} ${activeReport?.label ?? ""} ของ "${selectedClient.name}" (${filings.length} รายการ + ${docs.length} เอกสาร)?`
      )
    )
      return;
    setGenerating(true);
    setStatus("");
    try {
      await buildAndArchiveReportPdf({ download: true });
      setStatus("สร้างรายงานสำเร็จ — ดาวน์โหลดแล้ว และบันทึกสำเนาในประวัติไฟล์รายงานแล้ว");
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
            title={`คัดลอกจากรอบล่าสุด (${reports[reports.length - 1]?.label ?? "ครั้งที่ 1"}) เป็นรอบใหม่`}
            aria-label="คัดลอกจากรอบล่าสุดเป็นรอบใหม่"
            onClick={copyLastRound}
            disabled={!clientId || copyingFrom || !reports.length}
          >
            {copyingFrom ? <SpinnerIcon /> : <CopyLastIcon />}
            <span className="ml-1 hidden sm:inline">คัดลอกรอบล่าสุด</span>
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
          <section className="max-w-4xl">
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">รอบรายงาน:</span>
                {reportsLoading ? (
                  <span className="text-xs text-neutral-500">กำลังโหลด...</span>
                ) : (
                  reports.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setActiveReportId(r.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        r.id === activeReportId
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                      }`}
                      title={r.report_no ?? undefined}
                    >
                      {r.label ?? `ครั้งที่ ${r.seq}`}
                      {r.status === "issued" ? " · ออกแล้ว" : ""}
                    </button>
                  ))
                )}
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    className="input w-16 px-2 py-1 text-xs"
                    placeholder={String(nextRoundSeq)}
                    value={newRoundSeq}
                    onChange={(e) => setNewRoundSeq(e.target.value)}
                    title="ครั้งที่ (เว้นว่าง = อัตโนมัติ)"
                    aria-label="เลือกครั้งที่"
                  />
                  <button
                    className="btn text-xs"
                    onClick={() => {
                      const trimmed = newRoundSeq.trim();
                      addReportRound(trimmed ? Number(trimmed) : undefined);
                      setNewRoundSeq("");
                    }}
                    disabled={reportBusy || reportsLoading}
                  >
                    + เพิ่มรอบ
                  </button>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-600">
                <span>
                  เลขที่รายงาน:{" "}
                  <span className="font-medium">{activeReport?.report_no ?? "-"}</span>
                </span>
                <span>
                  สถานะ: {reportLocked ? "ออกแล้ว (ล็อก แก้ไขไม่ได้)" : "ฉบับร่าง"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    className="btn text-xs"
                    onClick={() => activeReport && toggleReportIssued(activeReport)}
                    disabled={reportBusy || !activeReport}
                  >
                    {reportLocked ? "เปิดแก้ไข" : "ออกรายงาน"}
                  </button>
                  {reports.length > 1 && (
                    <button
                      className="btn-danger text-xs"
                      onClick={() => activeReport && removeReportRound(activeReport)}
                      disabled={reportBusy}
                    >
                      ลบรอบนี้
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="max-w-4xl space-y-3">
            <h2 className="font-medium">
              ส่วนที่ 1 — ปก: รายการงานภาษี ประจำเดือน {periodToThai(period)}
              {activeReport?.label ? ` (${activeReport.label})` : ""}
            </h2>

            {reportLocked && (
              <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                รอบนี้ {activeReport?.report_no} ออกแล้ว — เปิดแก้ไขก่อนเพื่อเพิ่ม/แก้รายการ
                หรือสร้างรอบใหม่
              </p>
            )}

            <div className="card grid grid-cols-2 gap-x-2 gap-y-3 lg:grid-cols-[150px_135px_minmax(0,1.7fr)_170px_auto] lg:items-end lg:gap-x-3">
              <div className="order-1 lg:order-none">
                <label className="label">แบบฟอร์ม</label>
                <input
                  className="input"
                  list="form-presets"
                  placeholder="ภ.พ.30"
                  value={newFormCode}
                  onChange={(e) => setNewFormCode(e.target.value)}
                  disabled={reportLocked}
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
                  inputMode="decimal"
                  value={newAmount}
                  onChange={(e) => setNewAmount(parseAmountInput(e.target.value))}
                  onBlur={() =>
                    setNewAmount((v) => (v ? fmtAmountInput(v) : v))
                  }
                  placeholder="0.00"
                  disabled={reportLocked}
                />
              </div>
              <div className="order-3 col-span-2 lg:order-none lg:col-span-1">
                <label className="label">รายละเอียด</label>
                <input
                  className="input"
                  placeholder="เช่น ภาษีมูลค่าเพิ่ม เดือน 7/69"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  disabled={reportLocked}
                />
              </div>
              <div className="order-4 lg:order-none">
                <label className="label">วิธีชำระ</label>
                <input
                  className="input"
                  list="payment-method-presets"
                  placeholder="เช่น สลิป หน้า 2"
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value)}
                  disabled={reportLocked}
                />
                <datalist id="payment-method-presets">
                  {payMethodPresetList.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <button
                className="btn-primary order-5 col-span-2 lg:order-none lg:col-span-1"
                onClick={addFiling}
                disabled={adding || reportLocked}
              >
                เพิ่มรายการ
              </button>
            </div>

            <details className="card !py-2 text-sm">
              <summary className="cursor-pointer text-neutral-600">
                จัดการตัวเลือกวิธีชำระ ({payMethodPresetList.length})
              </summary>
              <div className="mt-2 flex gap-2">
                <input
                  className="input"
                  placeholder="เพิ่มวิธีชำระใหม่ เช่น สลิป หน้า 3"
                  value={newPayMethodPreset}
                  onChange={(e) => setNewPayMethodPreset(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addPayMethodPreset();
                  }}
                />
                <button className="btn shrink-0" onClick={addPayMethodPreset}>
                  เพิ่ม
                </button>
              </div>
              {payMethodPresetList.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {payMethodPresetList.map((p) => (
                    <li
                      key={p}
                      className="flex items-center gap-2 rounded bg-neutral-50 px-2 py-1"
                    >
                      <span className="min-w-0 flex-1 truncate">{p}</span>
                      <button
                        className="text-neutral-400 hover:text-red-600"
                        onClick={() => removePayMethodPreset(p)}
                        aria-label={`ลบวิธีชำระ ${p}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </details>

            {loading && loadedKey !== `${clientId}|${period}|${activeReportId}` ? (
              <p className="text-sm text-neutral-500">กำลังโหลด...</p>
            ) : !filings.length ? (
              <p className="text-sm text-neutral-500">
                ยังไม่มีรายการในเดือนนี้ — เพิ่มรายการแรกด้านบน
              </p>
            ) : (
              filings.map((f, i) => (
                <FilingCard
                  key={f.id}
                  filing={f}
                  bankAccounts={bankAccounts}
                  locked={reportLocked}
                  qrBusy={qrFilingId === f.id}
                  slipBusy={slipFilingId === f.id}
                  canMoveUp={i > 0}
                  canMoveDown={i < filings.length - 1}
                  onMoveUp={() => moveFiling(f.id, -1)}
                  onMoveDown={() => moveFiling(f.id, 1)}
                  onPatch={patchFiling}
                  onDelete={() => deleteFiling(f)}
                  onUploadQr={(file) => uploadFilingQr(f, file)}
                  onRemoveQr={removeFilingQr}
                  onUploadSlip={(file) => uploadFilingSlip(f, file)}
                  onRemoveSlip={removeFilingSlip}
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
                    disabled={!filings.length || clearingAll || generating || reportLocked}
                    title="ลบรายการทั้งหมดของรอบที่เลือก"
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
                  if (reportLocked || docsBusy) return;
                  e.preventDefault();
                  setDocsDragActive(true);
                }}
                onDragLeave={() => setDocsDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDocsDragActive(false);
                  if (!reportLocked && !docsBusy && e.dataTransfer.files?.length)
                    addDocs(e.dataTransfer.files);
                }}
                onClick={() => {
                  if (!reportLocked && !docsBusy) docsInputRef.current?.click();
                }}
                className={`flex min-h-36 flex-col items-center justify-center rounded border-2 border-dashed p-8 text-center text-sm transition ${
                  reportLocked || docsBusy
                    ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60"
                    : `cursor-pointer ${
                        docsDragActive
                          ? "border-blue-500 bg-blue-50"
                          : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
                      }`
                }`}
              >
                <input
                  ref={docsInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  disabled={reportLocked || docsBusy}
                  onChange={(e) => {
                    if (e.target.files?.length) addDocs(e.target.files);
                    e.target.value = "";
                  }}
                />
                {docsBusy
                  ? "กำลังอัปโหลด..."
                  : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก (PDF / PNG / JPG — เลือกได้หลายไฟล์)"}
              </div>
              {!docs.length ? (
                <p className="text-sm text-neutral-500">
                  {reportLocked
                    ? "รายงานออกแล้ว — เปิดแก้ไขก่อนเพื่อเพิ่มเอกสาร"
                    : "ยังไม่มีเอกสาร — ไฟล์จะต่อท้ายปกตามลำดับที่แสดง"}
                </p>
              ) : (
                <>
                  <p className="text-xs text-neutral-500">
                    บันทึกไว้แล้ว {docs.length} ไฟล์ (ลำดับ = ลำดับในไฟล์ PDF)
                  </p>
                  <ol className="space-y-1 text-sm text-neutral-600">
                    {docs.map((d, i) => (
                      <li
                        key={d.id}
                        className="flex items-center gap-1 rounded border border-neutral-100 px-2 py-1"
                      >
                        <span className="mr-1 text-xs text-neutral-400">{i + 1}.</span>
                        <span className="min-w-0 flex-1 truncate" title={d.file_name}>
                          {d.file_name}
                          <span className="ml-1 text-xs text-neutral-400">
                            {(d.size_bytes / 1024).toFixed(0)} KB
                          </span>
                        </span>
                        <button
                          className="btn !px-1.5 !py-0.5 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveDoc(d.id, -1);
                          }}
                          disabled={i === 0 || reportLocked}
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
                          disabled={i === docs.length - 1 || reportLocked}
                          aria-label="เลื่อนลง"
                        >
                          ↓
                        </button>
                        <button
                          className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeDoc(d.id);
                          }}
                          disabled={reportLocked}
                          aria-label="ลบเอกสาร"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ol>
                  <div>
                    <button
                      className="btn-danger text-xs"
                      onClick={clearDocs}
                      disabled={docsBusy || reportLocked}
                    >
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
                    className="btn"
                    onClick={previewCover}
                    disabled={previewBusy || generating}
                  >
                    {previewBusy ? "กำลังสร้างตัวอย่าง..." : "ดูตัวอย่างปก"}
                  </button>
                  <button
                    className="btn-primary"
                    onClick={generatePdf}
                    disabled={generating}
                  >
                    {generating ? "กำลังสร้าง..." : "ดาวน์โหลด PDF"}
                  </button>
                </div>
              </div>

              <div className="card mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">ลิงก์แชร์ให้ลูกค้า</span>
                  {!reportLocked && (
                    <span className="text-xs text-neutral-500">
                      (ต้องออกรายงานก่อน)
                    </span>
                  )}
                  {share && (
                    <button
                      className="btn text-xs"
                      onClick={revokeShareLink}
                      disabled={shareBusy}
                    >
                      ยกเลิก
                    </button>
                  )}
                  <button
                    className="btn-primary ml-auto text-xs"
                    onClick={
                      share
                        ? async () => {
                            await navigator.clipboard.writeText(share.url).catch(() => undefined);
                            setStatus("คัดลอกลิงก์แล้ว");
                          }
                        : createShareLink
                    }
                    disabled={shareBusy || (!share && !reportLocked)}
                  >
                    {shareBusy
                      ? "กำลังดำเนินการ..."
                      : share
                        ? "คัดลอกลิงก์"
                        : "สร้างลิงก์แชร์ (30 วัน)"}
                  </button>
                </div>
                {share ? (
                  <div className="space-y-1 text-xs">
                    <div className="break-all font-mono text-neutral-700">
                      {share.url}
                    </div>
                    <div className="text-neutral-500">
                      หมดอายุ{" "}
                      {share.expiresAt
                        ? new Date(share.expiresAt).toLocaleDateString("th-TH")
                        : "-"}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">
                    ส่งลิงก์นี้ให้ลูกค้าทาง LINE เพื่อดูรายการ ชำระเงิน และดาวน์โหลด PDF
                  </p>
                )}
              </div>
            </section>
          )}

          {activeReportId && (
            <section className="max-w-4xl space-y-2">
              <h2 className="font-medium">ประวัติไฟล์รายงาน</h2>
              <div className="overflow-x-auto">
                <table className="table-base w-full min-w-[620px]">
                  <thead>
                    <tr>
                      <th>ชื่อไฟล์</th>
                      <th>ขนาด</th>
                      <th>วันที่บันทึก</th>
                      <th>ผู้สร้าง</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportFiles.map((f) => (
                      <tr key={f.id}>
                        <td>{f.file_name}</td>
                        <td className="whitespace-nowrap">{fmtSize(f.size_bytes)}</td>
                        <td className="whitespace-nowrap">
                          {new Date(f.uploaded_at).toLocaleString("th-TH")}
                        </td>
                        <td>{f.uploaded_by ?? "—"}</td>
                        <td className="text-right">
                          <button
                            className="btn text-xs"
                            onClick={() => downloadReportFile(f)}
                            disabled={downloadingId === f.id}
                          >
                            {downloadingId === f.id ? "กำลังเปิด..." : "ดาวน์โหลด"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!reportFiles.length && (
                      <tr>
                        <td colSpan={5} className="text-neutral-500">
                          ยังไม่มีไฟล์รายงานที่บันทึกไว้ — กด &quot;ดาวน์โหลด PDF&quot;
                          เพื่อสร้างและเก็บสำเนา
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="max-w-4xl">
            <button
              className="btn"
              onClick={() => setShowBankManager((v) => !v)}
            >
              {showBankManager
                ? "ซ่อนบัญชีธนาคารของสำนักงาน"
                : "บัญชีธนาคารของสำนักงาน (ใช้ร่วมทุกไคลเอนต์)"}
            </button>

            {showBankManager && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-neutral-500">
                  บัญชีธนาคารใช้ร่วมกันทุกไคลเอนต์ — เพิ่มครั้งเดียวแล้วเลือกใช้กับรายการของลูกค้าได้ทุกคน
                </p>
                <div className="overflow-x-auto">
                  <table className="table-base w-full min-w-[880px]">
                    <thead>
                      <tr>
                        <th>ชื่อ</th>
                        <th>ธนาคาร</th>
                        <th>เลขบัญชี</th>
                        <th>ชื่อบัญชี</th>
                        <th>PromptPay</th>
                        <th>QR สำหรับสแกนจ่าย</th>
                        <th>โลโก้ 1 / 2</th>
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
                          <td>
                            <div className="flex flex-col items-start gap-1">
                              {(["top", "bottom"] as const).map((slot) => {
                                const path =
                                  slot === "bottom"
                                    ? b.logo_bottom_path
                                    : b.logo_path;
                                const busy = logoBusyId === `${b.id}:${slot}`;
                                const label = slot === "bottom" ? "2" : "1";
                                return path ? (
                                  <span
                                    key={slot}
                                    className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs"
                                  >
                                    {label}
                                    <button
                                      className="text-red-500 hover:text-red-700"
                                      aria-label={`ลบโลโก้${label}`}
                                      onClick={() =>
                                        handleBankLogoRemove(b.id, slot)
                                      }
                                      disabled={busy}
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <label
                                    key={slot}
                                    className="btn inline-flex cursor-pointer text-xs"
                                  >
                                    {busy ? "..." : `+${label}`}
                                    <input
                                      type="file"
                                      accept="image/png,image/jpeg"
                                      className="hidden"
                                      disabled={busy}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        handleBankLogoUpload(b.id, slot, file);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                );
                              })}
                            </div>
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
                          <td colSpan={8} className="text-neutral-500">
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
              <label className="label">โลโก้บริษัท (หัวกระดาษหน้าปก)</label>
              <p className="text-xs text-neutral-500">
                แสดงมุมซ้ายบนของหน้าปกรายงาน PDF — รองรับ PNG/JPG
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

            <div className="space-y-3 border-t border-neutral-200 pt-3">
              <div className="space-y-1">
                <label className="label">ชื่อบริษัท / สำนักงาน</label>
                <input
                  className="input"
                  placeholder="Taxwork"
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="label">ผู้จัดทำ (แสดงบนปก)</label>
                <input
                  className="input"
                  placeholder="เว้นว่างเพื่อใช้ชื่อบริษัท / สำนักงาน"
                  value={preparedBy}
                  onChange={(e) => setPreparedBy(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="label">รูปแบบปก</label>
                <select
                  className="input"
                  value={coverStyle}
                  onChange={(e) =>
                    setCoverStyle(
                      e.target.value === "classic" ? "classic" : "modern"
                    )
                  }
                >
                  <option value="modern">ใหม่ (ขาวดำ หัวกระดาษ + โลโก้กลาง)</option>
                  <option value="classic">เดิม (ขาวดำ)</option>
                </select>
              </div>
              <p className="text-xs text-neutral-500">
                เลือก &quot;เดิม&quot; เพื่อย้อนกลับไปใช้ปกแบบก่อนหน้า (ใช้ได้ทันที
                โดยไม่ต้อง deploy ใหม่)
              </p>
              <div className="space-y-1">
                <label className="label">ตัวสร้างไฟล์ PDF (ทดลอง)</label>
                <select
                  className="input"
                  value={reportRenderer}
                  onChange={(e) =>
                    setReportRenderer(e.target.value === "server" ? "server" : "legacy")
                  }
                >
                  <option value="legacy">เดิม (สร้างในเบราว์เซอร์)</option>
                  <option value="server">ใหม่ (สร้างบนเซิร์ฟเวอร์ — ข้อความจริง คัดลอกได้)</option>
                </select>
                <p className="text-xs text-neutral-500">
                  เลือก &quot;เดิม&quot; เพื่อย้อนกลับได้ทันทีโดยไม่ต้อง deploy ใหม่
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                className="btn-primary"
                onClick={async () => {
                  await saveBranding();
                  setShowSettings(false);
                }}
                disabled={brandingBusy || settingsLoading}
              >
                {brandingBusy ? "กำลังบันทึก..." : "เสร็จสิ้น"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closePreview}
        >
          <div
            className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h2 className="text-sm font-bold">ตัวอย่างปก (Preview)</h2>
              <button
                className="text-neutral-400 hover:text-neutral-700"
                onClick={closePreview}
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>
            <iframe
              src={`${previewUrl}#toolbar=0&navpanes=0`}
              title="ตัวอย่างหน้าปกรายงาน"
              className="h-full w-full flex-1"
            />
            <div className="flex items-center justify-end gap-3 border-t border-neutral-200 px-4 py-3">
              <button className="btn" onClick={closePreview}>
                ปิด
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  closePreview();
                  void generatePdf();
                }}
                disabled={generating}
              >
                ดาวน์โหลด PDF
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
  locked,
  qrBusy,
  slipBusy,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onPatch,
  onDelete,
  onUploadQr,
  onRemoveQr,
  onUploadSlip,
  onRemoveSlip,
}: {
  filing: Filing;
  bankAccounts: BankAccount[];
  locked?: boolean;
  qrBusy?: boolean;
  slipBusy?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatch: (id: string, patch: Partial<Filing>) => void;
  onDelete: () => void;
  onUploadQr: (file: File) => void;
  onRemoveQr: (att: Attachment) => void;
  onUploadSlip: (file: File) => void;
  onRemoveSlip: (att: Attachment) => void;
}) {
  const editingRef = useRef<string | null>(null);
  const qrAtt = filing.filing_attachments.find((a) => a.kind === "qr") ?? null;
  const slipAtt = filing.filing_attachments.find((a) => a.kind === "slip") ?? null;
  const [draft, setDraft] = useState({
    form_code: filing.form_code,
    description: filing.description ?? "",
    amount: fmtAmountInput(String(Number(filing.amount))),
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
        Number(parseAmountInput(prev.amount) || "0") !== Number(filing.amount) &&
        editingRef.current === "amount"
          ? prev.amount
          : fmtAmountInput(String(Number(filing.amount))),
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
      const num = Number(parseAmountInput(raw) || "0");
      if (num !== Number(filing.amount)) onPatch(filing.id, { amount: num });
      else setDraft((p) => ({ ...p, amount: fmtAmountInput(String(num)) }));
      return;
    }
    const val = raw.trim() || null;
    if (val !== filing[key]) onPatch(filing.id, { [key]: val });
  }

  function fieldHandlers(key: Parameters<typeof commitField>[0]) {
    return {
      value: draft[key],
      disabled: locked,
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
            inputMode="decimal"
            value={draft.amount}
            disabled={locked}
            onFocus={() => {
              editingRef.current = "amount";
            }}
            onBlur={() => {
              editingRef.current = null;
              commitField("amount");
            }}
            onChange={(e) =>
              setDraft((p) => ({ ...p, amount: parseAmountInput(e.target.value) }))
            }
            placeholder="0.00"
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
            list="payment-method-presets"
            placeholder="เช่น สลิป หน้า 2"
            {...fieldHandlers("payment_method")}
          />
        </div>
        <div className="order-5 col-span-2 lg:order-none lg:col-span-1">
          <label className="label">แนบบัญชีธนาคาร</label>
          <select
            className="input"
            value={filing.bank_account_id ?? ""}
            disabled={locked}
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
        <div className="order-6 flex items-end gap-1 justify-self-end self-end lg:order-none">
          <span className="inline-flex overflow-hidden rounded-md border border-neutral-300">
            <button
              type="button"
              className="px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
              onClick={onMoveUp}
              disabled={locked || !canMoveUp}
              aria-label="เลื่อนขึ้น"
              title="เลื่อนขึ้น"
            >
              ↑
            </button>
            <button
              type="button"
              className="border-l border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
              onClick={onMoveDown}
              disabled={locked || !canMoveDown}
              aria-label="เลื่อนลง"
              title="เลื่อนลง"
            >
              ↓
            </button>
          </span>
          <button
            className="btn-danger"
            onClick={onDelete}
            disabled={locked}
          >
            ลบ
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
        <span className="text-xs text-neutral-500">สลิป / ใบนำฝาก</span>
        {slipAtt ? (
          <>
            <FileThumb
              storagePath={slipAtt.storage_path}
              isImage={isImageAttachment(slipAtt)}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-neutral-600" title={slipAtt.file_name}>
              {slipAtt.file_name}
            </span>
            {slipAtt.pdf_page ? (
              <span className="text-[11px] text-neutral-400">
                หน้า {slipAtt.pdf_page}
              </span>
            ) : null}
            <button
              type="button"
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
              onClick={() => onRemoveSlip(slipAtt)}
              disabled={locked}
            >
              ลบสลิป
            </button>
          </>
        ) : (
          <DropZone
            label={slipBusy ? "กำลังอัปโหลด..." : "+ แนบสลิป"}
            accept="image/png,image/jpeg,application/pdf"
            disabled={locked || slipBusy}
            onFile={onUploadSlip}
          />
        )}
        <span className="text-[11px] text-neutral-400">
          ลากไฟล์มาวางได้ · วางหลังหน้าปก
        </span>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
        <span className="text-xs text-neutral-500">QR ชำระเงิน</span>
        {qrAtt ? (
          <>
            <QrThumb storagePath={qrAtt.storage_path} />
            <span className="min-w-0 flex-1 truncate text-xs text-neutral-600" title={qrAtt.file_name}>
              {qrAtt.file_name}
            </span>
            <button
              type="button"
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
              onClick={() => onRemoveQr(qrAtt)}
              disabled={locked}
            >
              ลบ QR
            </button>
          </>
        ) : (
          <DropZone
            label={qrBusy ? "กำลังอัปโหลด..." : "+ แนบ QR"}
            accept="image/png,image/jpeg"
            disabled={locked || qrBusy}
            onFile={onUploadQr}
          />
        )}
        <span className="text-[11px] text-neutral-400">
          ลากไฟล์มาวางได้ · QR สร้างใหม่ต่อการยื่น
        </span>
      </div>
    </div>
  );
}

function DropZone({
  label,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`btn text-xs ${dragging ? "border-blue-500 bg-blue-50" : ""} ${
        disabled ? "pointer-events-none opacity-50" : "cursor-pointer"
      }`}
    >
      {label}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function QrThumb({ storagePath }: { storagePath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await fetchAttachmentBytes(storagePath);
        const u = URL.createObjectURL(
          new Blob([bytes], { type: sniffImageMime(bytes) })
        );
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        revoked = u;
        setUrl(u);
      } catch {
        setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [storagePath]);
  if (!url)
    return (
      <span className="inline-block h-9 w-9 shrink-0 animate-pulse rounded border border-neutral-200 bg-neutral-100" />
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="QR"
      className="h-9 w-9 shrink-0 rounded border border-neutral-200 object-contain"
    />
  );
}

function isImageAttachment(att: { mime_type: string | null; file_name: string }): boolean {
  return (
    (att.mime_type?.startsWith("image/") ?? false) ||
    /\.(png|jpe?g)$/i.test(att.file_name)
  );
}

function FileThumb({
  storagePath,
  isImage,
}: {
  storagePath: string;
  isImage: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await fetchAttachmentBytes(storagePath);
        const u = URL.createObjectURL(
          new Blob([bytes], { type: sniffImageMime(bytes) })
        );
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        revoked = u;
        setUrl(u);
      } catch {
        setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [storagePath, isImage]);

  if (!isImage)
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-[10px] font-semibold text-neutral-500">
        PDF
      </span>
    );
  if (!url)
    return (
      <span className="inline-block h-9 w-9 shrink-0 animate-pulse rounded border border-neutral-200 bg-neutral-100" />
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-9 w-9 shrink-0 rounded border border-neutral-200 object-contain"
    />
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

function CopyLastIcon() {
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
      <path d="M12 3v6" />
      <path d="M9 6l3 3 3-3" />
      <path d="M4 15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
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
