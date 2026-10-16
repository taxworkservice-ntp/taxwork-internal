"use client";

import { useRef, useState } from "react";
import { thaiBahtText } from "@/lib/thai-baht-text";
import {
  RDX_FORMS,
  buildJsonZip,
  buildRdx,
  buildTemplate,
  convertFile,
  type ConvertResult,
  type RdxForm,
} from "@/lib/rdprep/convert";

// Heavy client libs are imported on demand (inside the handlers that use them)
// so they never ship in the Tools page's initial bundle.
type PdfLibModule = typeof import("pdf-lib");
let _pdfLib: Promise<PdfLibModule> | null = null;
const loadPdfLib = (): Promise<PdfLibModule> => (_pdfLib ??= import("pdf-lib"));
const loadCantoo = () => import("@cantoo/pdf-lib");
const loadJsZip = () => import("jszip");

type UnlockItem = {
  id: string;
  file: File;
  password: string;
  status: "idle" | "processing" | "ok" | "fail";
  error?: string;
  bytes?: Uint8Array;
};

type SubToken = { line: number; text: string; value: number | null };

function parseSubToken(token: string, line: number): SubToken[] {
  // Returns 1+ tokens: comma splits only when NOT a thousand-separator.
  // "12,500" -> [12500]; "12500, 3200" -> [12500, 3200]
  const parts = token.split(/,(?!\d{3}\b)/);
  return parts.map((p) => {
    let t = p.trim().replace(/[฿\s]|บาท|THB/gi, "");
    if (!t) return { line, text: p.trim(), value: null };
    let neg = false;
    const paren = t.match(/^\((.*)\)$/);
    if (paren) {
      neg = true;
      t = paren[1].trim();
    }
    const cleaned = t.replace(/,/g, "");
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(cleaned))
      return { line, text: p.trim(), value: null };
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) return { line, text: p.trim(), value: null };
    return { line, text: p.trim(), value: neg ? -Math.abs(n) : n };
  });
}

function parseSubAmounts(raw: string) {
  // Line-first: each line is split on tabs/semicolons/pipes only —
  // bare commas are thousand-separators unless proven otherwise.
  const values: number[] = [];
  const tokens: SubToken[] = [];
  const lines = raw.split(/\r?\n/);
  lines.forEach((ln, li) => {
    if (!ln.trim()) return;
    const cells = ln.split(/[\t;|]+/);
    for (const cell of cells) {
      for (const tok of parseSubToken(cell, li + 1)) {
        if (!tok.text) continue;
        tokens.push(tok);
        if (tok.value !== null) values.push(tok.value);
      }
    }
  });
  return { values, tokens, invalid: tokens.filter((t) => t.value === null).length };
}

function SubPreview({ raw }: { raw: string }) {
  const { values, tokens } = parseSubAmounts(raw);
  const bad = tokens.filter((t) => t.value === null);
  const badLines = [...new Set(bad.map((t) => t.line))];
  return (
    <div className="mt-2 rounded bg-neutral-50 p-2 text-xs">
      <span>
        อ่านได้ {values.length} ยอด
        {bad.length > 0 && (
          <span className="text-red-600">
            {" "}• ข้าม {bad.length} ช่อง (บรรทัดที่ {badLines.join(", ")})
          </span>
        )}
      </span>
      {bad.length > 0 && (
        <div className="mt-1 max-h-20 overflow-y-auto font-mono text-red-600">
          {bad.slice(0, 10).map((t, i) => (
            <div key={i}>
              บรรทัด {t.line}: “{t.text}”
            </div>
          ))}
          {bad.length > 10 && <div>…และอีก {bad.length - 10} ช่อง</div>}
        </div>
      )}
    </div>
  );
}

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const TOOL_ICONS: Record<string, React.ReactNode> = {
  merge: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <path d="M7 10v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7" />
    </svg>
  ),
  split: (
    <svg {...ICON_PROPS}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.1 7.6 20 18M8.1 16.4 20 6" />
    </svg>
  ),
  unlock: (
    <svg {...ICON_PROPS}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7.5-2" />
    </svg>
  ),
  fix: (
    <svg {...ICON_PROPS}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  ),
  rename: (
    <svg {...ICON_PROPS}>
      <path d="M20.6 13.4 12 22H4v-8L12.6 5.4a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8Z" />
      <path d="M14 8l2 2" />
    </svg>
  ),
  vat: (
    <svg {...ICON_PROPS}>
      <path d="M19 5 5 19" />
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
    </svg>
  ),
  taxid: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M5.5 16a2.5 2.5 0 0 1 5 0M14 9h4M14 13h4" />
    </svg>
  ),
  subset: (
    <svg {...ICON_PROPS}>
      <path d="M6 4h12l-5 6v7l-2 1v-8L6 4Z" />
    </svg>
  ),
  rdx: (
    <svg {...ICON_PROPS}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
};

type ToolCategory = "pdf" | "tax" | "data";

type ToolMeta = {
  id: string;
  category: ToolCategory;
  title: string;
  desc: string;
  keywords: string;
};

const TOOLS: ToolMeta[] = [
  { id: "merge", category: "pdf", title: "รวม PDF", desc: "รวมหลายไฟล์ PDF เป็นไฟล์เดียว", keywords: "merge รวม รวมไฟล์ combine" },
  { id: "split", category: "pdf", title: "แยก PDF", desc: "แยกตามช่วงหน้า หรือทุกหน้าเป็น ZIP", keywords: "split แยก แบ่ง zip ทุกหน้า" },
  { id: "unlock", category: "pdf", title: "ปลดล็อก PDF", desc: "ลบรหัสผ่านหลายไฟล์ → ZIP", keywords: "unlock password ปลดล็อก รหัสผ่าน ถอด" },
  { id: "fix", category: "pdf", title: "หมุน / ลบ / จัดหน้า PDF", desc: "แก้สแกนเอียง ตัดหน้าว่าง จัดลำดับใหม่", keywords: "rotate หมุน ลบหน้า จัด ลำดับ reorder delete" },
  { id: "rename", category: "pdf", title: "เปลี่ยนชื่อเป็นชุด → ZIP", desc: "ตั้งชื่อไฟล์ใหม่ตามลำดับ พร้อมนับหน้า", keywords: "rename เปลี่ยนชื่อ ลำดับ batch zip" },
  { id: "vat", category: "tax", title: "VAT / หัก ณ ที่จ่าย / ตัวอักษร", desc: "คำนวณ VAT, ภาษีหัก ณ ที่จ่าย และแปลงจำนวนเงินเป็นตัวอักษร", keywords: "vat wht ภาษี หัก ณ ที่จ่าย ตัวอักษร baht" },
  { id: "taxid", category: "tax", title: "เช็คเลขผู้เสียภาษี 13 หลัก", desc: "ตรวจ checksum หลายเลขพร้อมกัน", keywords: "tax id เลขผู้เสียภาษี checksum 13" },
  { id: "subset", category: "tax", title: "จับคู่ยอดรวม", desc: "หาชุดยอดที่รวมได้ตรงหรือใกล้เป้าหมาย", keywords: "subset sum จับคู่ ยอดรวม กระทบยอด" },
  { id: "rdx", category: "data", title: "RDPrep Excel → RDX", desc: "แปลง Excel/JSON เป็น RDX (PND3/PND53) — AES-256", keywords: "rdx rdprep excel pnd3 pnd53 ภงด json" },
];

const CATEGORIES: { key: "all" | ToolCategory; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pdf", label: "PDF" },
  { key: "tax", label: "ภาษี & คำนวณ" },
  { key: "data", label: "ข้อมูล & ส่งออก" },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      {...ICON_PROPS}
      className={`transition-transform ${open ? "rotate-180" : ""}`}
      width={16}
      height={16}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ToolCard({
  id,
  title,
  desc,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`card overflow-hidden p-0 transition-shadow ${
        open ? "sm:col-span-2 ring-1 ring-neutral-900/5 shadow-sm" : "hover:shadow-sm"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
          {TOOL_ICONS[id]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block text-xs text-neutral-500">{desc}</span>
        </span>
        <span className="mt-1 shrink-0 text-neutral-400">
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && <div className="border-t border-neutral-100 p-4">{children}</div>}
    </section>
  );
}

export default function ToolsPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitRange, setSplitRange] = useState("");
  const [unlockItems, setUnlockItems] = useState<UnlockItem[]>([]);
  const [commonPassword, setCommonPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const unlockInputRef = useRef<HTMLInputElement>(null);
  const [mergeDragActive, setMergeDragActive] = useState(false);
  const [splitDragActive, setSplitDragActive] = useState(false);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const splitInputRef = useRef<HTMLInputElement>(null);
  const [splitMode, setSplitMode] = useState<"ranges" | "every-page">("ranges");
  const [splitAsZip, setSplitAsZip] = useState(true);
  const [splitTotal, setSplitTotal] = useState<number | null>(null);
  // --- VAT / WHT / baht text ---
  const [vatInput, setVatInput] = useState("");
  const [vatMode, setVatMode] = useState<"exclusive" | "inclusive">("exclusive");
  const [whtInput, setWhtInput] = useState("");
  const [whtRate, setWhtRate] = useState("3");
  const [bahtInput, setBahtInput] = useState("");
  // --- Tax ID check ---
  const [taxIds, setTaxIds] = useState("");
  // --- Fix pages (rotate/delete/reorder) ---
  const [fixFile, setFixFile] = useState<File | null>(null);
  const [fixTotal, setFixTotal] = useState<number | null>(null);
  const [fixRotate, setFixRotate] = useState(0);
  const [fixDeleteInput, setFixDeleteInput] = useState("");
  const [fixOrderInput, setFixOrderInput] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  const [fixDragActive, setFixDragActive] = useState(false);
  const fixInputRef = useRef<HTMLInputElement>(null);
  // --- Batch rename + inventory ---
  const [renameFiles, setRenameFiles] = useState<File[]>([]);
  const [renamePages, setRenamePages] = useState<(number | null)[]>([]);
  const [renamePrefix, setRenamePrefix] = useState("");
  const [renameStart, setRenameStart] = useState("1");
  const [renamePad, setRenamePad] = useState("2");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameDragActive, setRenameDragActive] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  // --- Subset sum (match amounts to target) ---
  const [subInput, setSubInput] = useState("");
  const [subTarget, setSubTarget] = useState("");
  const [subMode, setSubMode] = useState<"any" | "max" | "min">("any");
  const [subBusy, setSubBusy] = useState(false);
  const [subResult, setSubResult] = useState<{
    exact: number[][];
    closest: { indices: number[]; sum: number; diff: number }[];
    values: number[];
    target: number;
    invalid: number;
    partial: boolean;
  } | null>(null);
  // --- RDPrep Excel → RDX ---
  const [rdpFile, setRdpFile] = useState<File | null>(null);
  const [rdpForm, setRdpForm] = useState<RdxForm>("PND3");
  const [rdpYear, setRdpYear] = useState(() => String(new Date().getFullYear() + 543));
  const [rdpMonth, setRdpMonth] = useState("auto");
  const [rdpBusy, setRdpBusy] = useState(false);
  const [rdpStatus, setRdpStatus] = useState<string | null>(null);
  const [rdpResult, setRdpResult] = useState<ConvertResult | null>(null);
  const [rdpDragActive, setRdpDragActive] = useState(false);
  const rdpInputRef = useRef<HTMLInputElement>(null);
  // --- Tool catalog UI ---
  const [activeCat, setActiveCat] = useState<"all" | ToolCategory>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  function toolVisible(id: string) {
    const meta = TOOLS.find((t) => t.id === id);
    if (!meta) return false;
    if (activeCat !== "all" && meta.category !== activeCat) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${meta.title} ${meta.desc} ${meta.keywords}`.toLowerCase().includes(q);
  }
  function countFor(key: "all" | ToolCategory) {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((t) => {
      if (key !== "all" && t.category !== key) return false;
      if (!q) return true;
      return `${t.title} ${t.desc} ${t.keywords}`.toLowerCase().includes(q);
    }).length;
  }
  const toggleTool = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  function isPdf(f: File) {
    return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  }

  function addMergeFiles(files: File[] | FileList) {
    const arr = Array.from(files).filter(isPdf);
    if (!arr.length) {
      setMessage("เลือกเฉพาะไฟล์ PDF");
      return;
    }
    setMergeFiles((prev) => [...prev, ...arr]);
    setMessage(null);
  }

  function moveMergeFile(index: number, dir: -1 | 1) {
    setMergeFiles((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  async function merge() {
    if (mergeFiles.length < 2) {
      setMessage("เลือกไฟล์ PDF อย่างน้อย 2 ไฟล์");
      return;
    }
    setBusy(true);
    try {
      const { PDFDocument } = await loadPdfLib();
      const out = await PDFDocument.create();
      let ok = 0;
      const failed: string[] = [];
      for (const file of mergeFiles) {
        try {
          const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach((p) => out.addPage(p));
          ok++;
        } catch {
          failed.push(file.name);
        }
      }
      if (ok === 0) {
        setMessage("รวมไฟล์ไม่สำเร็จ — ตรวจสอบว่าไฟล์เป็น PDF ที่ถูกต้อง");
        return;
      }
      const bytes = await out.save();
      downloadBytes(bytes, "merged.pdf");
      setMessage(
        failed.length
          ? `รวม ${ok} ไฟล์แล้ว (ข้าม ${failed.length} ไฟล์: ${failed.join(", ")})`
          : `รวม ${ok} ไฟล์แล้ว`
      );
      setMergeFiles([]);
    } catch {
      setMessage("รวมไฟล์ไม่สำเร็จ — ตรวจสอบว่าไฟล์เป็น PDF ที่ถูกต้อง");
    } finally {
      setBusy(false);
    }
  }

  function parseRanges(range: string, total: number): number[][] {
    // "1-3,5" -> [[0,1,2],[4]]
    return range
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [a, b] = part.split("-").map((n) => parseInt(n.trim(), 10));
        const from = (a || 1) - 1;
        const to = (b || a || 1) - 1;
        const pages: number[] = [];
        for (let i = from; i <= to && i < total; i++) {
          if (i >= 0) pages.push(i);
        }
        return pages;
      })
      .filter((p) => p.length > 0);
  }

  async function setSplitFileWithInfo(f: File | null) {
    setSplitFile(f);
    setSplitTotal(null);
    if (!f) return;
    try {
      const { PDFDocument } = await loadPdfLib();
      const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
      setSplitTotal(src.getPageCount());
    } catch {
      setSplitTotal(null);
    }
  }

  function addSplitFile(files: File[] | FileList) {
    const f = Array.from(files).find(isPdf) ?? null;
    if (!f) {
      setMessage("เลือกเฉพาะไฟล์ PDF");
      return;
    }
    setSplitFileWithInfo(f);
    setMessage(null);
  }

  function baseName(name: string) {
    return name.replace(/\.pdf$/i, "");
  }

  async function downloadZipBlob(files: { name: string; bytes: Uint8Array }[], zipName: string) {
    const { default: JSZip } = await loadJsZip();
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.bytes);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function split() {
    if (!splitFile) {
      setMessage("เลือกไฟล์ PDF ที่จะแยกก่อน");
      return;
    }
    setBusy(true);
    try {
      const { PDFDocument } = await loadPdfLib();
      const src = await PDFDocument.load(await splitFile.arrayBuffer(), { ignoreEncryption: true });
      const total = src.getPageCount();
      setSplitTotal(total);
      const base = baseName(splitFile.name);

      if (splitMode === "every-page") {
        const parts: { name: string; bytes: Uint8Array }[] = [];
        for (let i = 0; i < total; i++) {
          const out = await PDFDocument.create();
          const [p] = await out.copyPages(src, [i]);
          out.addPage(p);
          parts.push({ name: `${base}-p${i + 1}.pdf`, bytes: await out.save() });
        }
        if (splitAsZip || parts.length > 3) {
          await downloadZipBlob(parts, `${base}-pages.zip`);
        } else {
          for (const p of parts) downloadBytes(p.bytes, p.name);
        }
        setMessage(`แยกทุกหน้าแล้ว (${total} ไฟล์)`);
        return;
      }

      const groups = parseRanges(splitRange, total);
      if (!groups.length) {
        setMessage(`กรอกช่วงหน้า เช่น "1-3,5" (ไฟล์นี้มี ${total} หน้า)`);
        return;
      }
      const parts: { name: string; bytes: Uint8Array }[] = [];
      for (const g of groups) {
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, g);
        pages.forEach((p) => out.addPage(p));
        parts.push({
          name: `${base}-${g.map((i) => i + 1).join("-")}.pdf`,
          bytes: await out.save(),
        });
      }
      if (splitAsZip) {
        await downloadZipBlob(parts, `${base}-split.zip`);
      } else {
        for (const p of parts) downloadBytes(p.bytes, p.name);
      }
      setMessage(`สร้าง ${parts.length} ไฟล์แล้ว`);
    } catch {
      setMessage("แยกไฟล์ไม่สำเร็จ — PDF หรือช่วงหน้าไม่ถูกต้อง (ไฟล์ติดรหัสผ่านต้องปลดล็อกก่อน)");
    } finally {
      setBusy(false);
    }
  }

  function downloadBytes(bytes: Uint8Array, name: string, type = "application/pdf") {
    const blob = new Blob([bytes as BlobPart], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // --- RDPrep Excel → RDX ---
  function addRdpFile(files: File[] | FileList) {
    const f = Array.from(files).find(
      (x) => x.name.toLowerCase().endsWith(".xlsx") || x.name.toLowerCase().endsWith(".json")
    );
    if (!f) {
      setRdpStatus("เลือกไฟล์ .xlsx หรือ .json");
      return;
    }
    setRdpFile(f);
    setRdpResult(null);
    setRdpStatus(null);
  }

  async function rdpConvert(): Promise<ConvertResult> {
    if (!rdpFile) throw new Error("เลือกไฟล์ก่อน");
    const result = await convertFile(rdpFile, {
      formCode: rdpForm,
      filingYear: parseInt(rdpYear, 10) || null,
      filingMonth: rdpMonth === "auto" ? null : parseInt(rdpMonth, 10) || null,
    });
    setRdpResult(result);
    return result;
  }

  async function rdpExportRdx() {
    setRdpBusy(true);
    setRdpStatus(null);
    try {
      const result = await rdpConvert();
      downloadBlob(await buildRdx(result), `${result.base}-010000.rdx`);
      setRdpStatus(`สร้าง ${result.base}-010000.rdx แล้ว — ${result.summary}`);
    } catch (e) {
      setRdpStatus(e instanceof Error ? e.message : "แปลงไฟล์ไม่สำเร็จ");
    } finally {
      setRdpBusy(false);
    }
  }

  async function rdpExportJson() {
    setRdpBusy(true);
    setRdpStatus(null);
    try {
      const result = await rdpConvert();
      downloadBlob(await buildJsonZip(result), `${result.base}-json.zip`);
      setRdpStatus(`สร้าง ${result.base}-json.zip แล้ว — ${result.summary}`);
    } catch (e) {
      setRdpStatus(e instanceof Error ? e.message : "แปลงไฟล์ไม่สำเร็จ");
    } finally {
      setRdpBusy(false);
    }
  }

  async function rdpTemplate() {
    downloadBlob(await buildTemplate(rdpForm), `rdx-template-${rdpForm.toLowerCase()}.xlsx`);
    setRdpStatus(`สร้างเทมเพลต ${rdpForm} แล้ว — กรอกชีต Settings และ Payees`);
  }

  function addUnlockFiles(files: File[] | FileList) {
    const arr = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (!arr.length) {
      setMessage("เลือกเฉพาะไฟล์ PDF");
      return;
    }
    setUnlockItems((prev) => [
      ...prev,
      ...arr.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`,
        file,
        password: commonPassword,
        status: "idle" as const,
      })),
    ]);
    setMessage(null);
  }

  function applyCommonPassword() {
    setUnlockItems((prev) => prev.map((it) => ({ ...it, password: commonPassword })));
  }

  async function unlockAll() {
    if (!unlockItems.length) {
      setMessage("เพิ่มไฟล์ PDF ก่อน");
      return;
    }
    setUnlockBusy(true);
    setMessage(null);
    let okCount = 0;
    for (const item of unlockItems) {
      setUnlockItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "processing", error: undefined } : it))
      );
      try {
        const buf = await item.file.arrayBuffer();
        const { PDFDocument: SecurePDFDocument } = await loadCantoo();
        let src = null as Awaited<ReturnType<typeof SecurePDFDocument.load>> | null;
        let lastErr: unknown = null;
        const candidates = item.password ? [item.password] : [""];
        for (const pw of candidates) {
          try {
            src = pw
              ? await SecurePDFDocument.load(buf.slice(0), { password: pw })
              : await SecurePDFDocument.load(buf.slice(0));
            // Force decrypt check: try to read pages
            src.getPageCount();
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            src = null;
          }
        }
        if (!src) throw lastErr ?? new Error("wrong password");
        const bytes = await src.save();
        okCount++;
        setUnlockItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: "ok", bytes, error: undefined } : it))
        );
      } catch {
        setUnlockItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: "fail", error: "รหัสผ่านไม่ถูก / ไฟล์เสีย" }
              : it
          )
        );
      }
    }
    const total = unlockItems.length;
    setMessage(`ปลดล็อกสำเร็จ ${okCount}/${total} ไฟล์ — กดดาวน์โหลด ZIP`);
    setUnlockBusy(false);
  }

  async function downloadZip() {
    const okItems = unlockItems.filter((it) => it.status === "ok" && it.bytes);
    if (!okItems.length) {
      setMessage("ยังไม่มีไฟล์ที่ปลดล็อกสำเร็จ");
      return;
    }
    const { default: JSZip } = await loadJsZip();
    const zip = new JSZip();
    for (const it of okItems) {
      const base = it.file.name.replace(/\.pdf$/i, "");
      zip.file(`${base}-unlocked.pdf`, it.bytes!);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unlocked-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const okCount = unlockItems.filter((i) => i.status === "ok").length;

  const rdpCurrentYear = new Date().getFullYear() + 543;
  const rdpYearOptions = [0, 1, 2, 3].map((d) => rdpCurrentYear - d);

  // --- Subset sum solver (parsers live at module scope) ---
  function subsetSearch() {
    const { values, invalid } = parseSubAmounts(subInput);
    const target = parseFloat(subTarget.replace(/,/g, ""));
    if (!values.length) {
      setMessage("วางรายการยอดเงินก่อน (บรรทัดละยอด หรือคั่นด้วยจุลภาค)");
      return;
    }
    if (!Number.isFinite(target)) {
      setMessage("กรอกยอดเป้าหมายก่อน");
      return;
    }
    if (values.length > 60) {
      setMessage(`รายการเยอะเกินไป (${values.length} รายการ สูงสุด 60) — ลดรายการแล้วลองใหม่`);
      return;
    }
    setSubBusy(true);
    setMessage(null);
    // Run async so UI can paint busy state
    setTimeout(() => {
      try {
        const sat = values.map((v) => Math.round(v * 100));
        const t = Math.round(target * 100);
        // Sort desc by value for better pruning, keep original indices
        const order = sat.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
        const sv = order.map((o) => o.v);
        const n = sv.length;
        // Suffix min/max for pruning (sums of remaining negatives/positives)
        const sufMin = new Array(n + 1).fill(0);
        const sufMax = new Array(n + 1).fill(0);
        for (let i = n - 1; i >= 0; i--) {
          sufMin[i] = sufMin[i + 1] + Math.min(0, sv[i]);
          sufMax[i] = sufMax[i + 1] + Math.max(0, sv[i]);
        }
        const exact: number[][] = [];
        const closest: { indices: number[]; sum: number; diff: number }[] = [];
        const seen = new Set<string>();
        const deadline = Date.now() + 1500;
        let partial = false;
        const chosen: number[] = []; // positions in sorted order
        // DP pass first: guarantees one exact match + the optimal closest set
        // for the active mode even when the DFS below runs out of time.
        // Keys use sorted-order positions — same key space as consider().
        const dp = new Map<number, number[]>();
        dp.set(0, []);
        let dpOverflow = false;
        for (let i = 0; i < n; i++) {
          const snap = [...dp.entries()];
          for (const [s, idxs] of snap) {
            const ns = s + sv[i];
            if (!dp.has(ns)) dp.set(ns, [...idxs, i]);
            if (dp.size > 300000) {
              dpOverflow = true;
              break;
            }
          }
          if (dpOverflow) {
            partial = true;
            break;
          }
        }
        if (!dpOverflow) {
          if (dp.has(t)) {
            const idxs = dp.get(t)!;
            if (idxs.length) {
              const posKey = [...idxs].sort((a, b) => a - b).join(",");
              seen.add("e" + posKey);
              exact.push(idxs.map((p) => order[p].i).sort((a, b) => a - b));
            }
          }
          let best: number | null = null;
          let bestDiff = Infinity;
          for (const s of dp.keys()) {
            if (s === 0) continue; // empty subset is never a useful answer
            const d = s - t;
            if (d === 0) continue;
            if (subMode === "max" && d > 0) continue;
            if (subMode === "min" && d < 0) continue;
            if (Math.abs(d) < bestDiff) {
              bestDiff = Math.abs(d);
              best = s;
            }
          }
          if (best !== null) {
            const idxs = dp.get(best)!;
            if (idxs.length) {
              const posKey = [...idxs].sort((a, b) => a - b).join(",");
              seen.add("c" + posKey);
              closest.push({
                indices: idxs.map((p) => order[p].i).sort((a, b) => a - b),
                sum: best,
                diff: best - t,
              });
            }
          }
        }
        function consider(sum: number) {
          if (!chosen.length) return;
          const diff = sum - t;
          const key = [...chosen].sort((a, b) => a - b).join(",");
          if (diff === 0) {
            if (seen.has("e" + key) || exact.length >= 20) return;
            seen.add("e" + key);
            exact.push(chosen.map((p) => order[p].i).sort((a, b) => a - b));
          } else {
            if (subMode === "max" && diff > 0) return;
            if (subMode === "min" && diff < 0) return;
            if (seen.has("c" + key)) return;
            seen.add("c" + key);
            const entry = {
              indices: chosen.map((p) => order[p].i).sort((a, b) => a - b),
              sum,
              diff,
            };
            // keep top 5 by |diff|, tie: fewer items
            closest.push(entry);
            closest.sort(
              (a, b) => Math.abs(a.diff) - Math.abs(b.diff) || a.indices.length - b.indices.length
            );
            if (closest.length > 5) closest.pop();
          }
        }
        function dfs(pos: number, sum: number): boolean {
          if (Date.now() > deadline) {
            partial = true;
            return true; // stop everything
          }
          if (pos === n) {
            consider(sum);
            return false;
          }
          // Prune exact branch only if target unreachable AND we already have plenty?
          // Never prune closest search strictly — just recurse both branches.
          // Include
          chosen.push(pos);
          const stop = dfs(pos + 1, sum + sv[pos]);
          chosen.pop();
          if (stop) return true;
          // Exclude (single-step for correctness with duplicates; `seen` dedupes)
          if (dfs(pos + 1, sum)) return true;
          return false;
        }
        // For n > 30 full DFS explodes — DP above already seeded one exact +
        // the optimal closest, so here only run a bounded DFS for more exact
        // alternatives with a tight deadline.
        if (n > 30) {
          // Bounded DFS for more exact alternatives with tight deadline
          if (exact.length) {
            const dfsDeadline = Date.now() + 600;
            const dfs2 = (pos: number, sum: number): boolean => {
              if (Date.now() > dfsDeadline || exact.length >= 20) return true;
              if (pos === n) {
                if (sum === t && chosen.length) {
                  const posKey = [...chosen].sort((a, b) => a - b).join(",");
                  if (!seen.has("e" + posKey)) {
                    seen.add("e" + posKey);
                    exact.push(chosen.map((p) => order[p].i).sort((a, b) => a - b));
                  }
                }
                return false;
              }
              if (sum + sufMin[pos] > t || sum + sufMax[pos] < t) {
                // exact unreachable from here (all-remaining range check, valid for pruning exact only)
                return false;
              }
              chosen.push(pos);
              if (dfs2(pos + 1, sum + sv[pos])) {
                chosen.pop();
                return true;
              }
              chosen.pop();
              if (dfs2(pos + 1, sum)) return true;
              return false;
            };
            chosen.length = 0;
            const r = dfs2(0, 0);
            if (r && exact.length >= 20) partial = true;
          }
        } else {
          dfs(0, 0);
        }
        setSubResult({ exact, closest, values, target, invalid, partial });
        const modeHint = subMode === "max" ? " (ไม่เกินเป้า)" : subMode === "min" ? " (เกินได้)" : "";
        if (exact.length) setMessage(`เจอชุดที่ตรงเป๊ะ ${exact.length} ชุด จาก ${values.length} รายการ`);
        else if (closest.length) setMessage(`ไม่เจอชุดตรงเป๊ะ — แสดง ${closest.length} ชุดใกล้เคียง${modeHint}`);
        else
          setMessage(
            subMode === "max"
              ? "ไม่เจอชุดที่ไม่เกินเป้าหมายเลย"
              : subMode === "min"
                ? "ไม่เจอชุดที่ถึงเป้าหมายเลย"
                : "ไม่เจอชุดใดเลย"
          );
      } finally {
        setSubBusy(false);
      }
    }, 30);
  }
  function fmtMoney(v: number) {
    return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // --- VAT / WHT / baht ---
  function num(s: string) {
    const n = parseFloat(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  const vatAmt = num(vatInput);
  const vatBase = vatMode === "exclusive" ? vatAmt : vatAmt / 1.07;
  const vatTax = vatMode === "exclusive" ? vatAmt * 0.07 : vatAmt - vatAmt / 1.07;
  const vatTotal = vatMode === "exclusive" ? vatAmt * 1.07 : vatAmt;
  const whtAmt = num(whtInput);
  const whtR = num(whtRate) / 100;
  const whtTax = whtAmt * whtR;
  const bahtAmt = num(bahtInput);
  const bahtText = bahtInput.trim() === "" ? "" : thaiBahtText(bahtAmt);

  // --- Tax ID ---
  function checkTaxId(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 13) return { digits, ok: false, reason: "ต้องมี 13 หลัก" };
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(digits[i], 10) * (13 - i);
    const check = (11 - (sum % 11)) % 10;
    if (check !== parseInt(digits[12], 10)) return { digits, ok: false, reason: "checksum ไม่ผ่าน" };
    return { digits, ok: true, reason: "" };
  }
  function formatTaxId(d: string) {
    return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
  }
  const taxRows = taxIds
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, ...checkTaxId(raw) }));
  const taxOkCount = taxRows.filter((r) => r.ok).length;

  // --- Fix pages ---
  async function setFixFileWithInfo(f: File | null) {
    setFixFile(f);
    setFixTotal(null);
    if (!f) return;
    try {
      const { PDFDocument } = await loadPdfLib();
      const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
      setFixTotal(src.getPageCount());
    } catch {
      setFixTotal(null);
      setMessage("เปิดไฟล์ไม่สำเร็จ — อาจติดรหัสผ่าน ให้ปลดล็อกก่อน");
    }
  }
  function parsePageList(input: string, total: number): number[] {
    const out = new Set<number>();
    for (const part of input.split(",")) {
      const t = part.trim();
      if (!t) continue;
      const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const a = Math.min(parseInt(m[1], 10), parseInt(m[2], 10));
        const b = Math.max(parseInt(m[1], 10), parseInt(m[2], 10));
        for (let i = a; i <= b; i++) if (i >= 1 && i <= total) out.add(i - 1);
      } else {
        const n = parseInt(t, 10);
        if (Number.isFinite(n) && n >= 1 && n <= total) out.add(n - 1);
      }
    }
    return [...out];
  }
  async function fixExport() {
    if (!fixFile || fixTotal === null) {
      setMessage("เลือกไฟล์ PDF ที่จะแก้ก่อน");
      return;
    }
    setFixBusy(true);
    try {
      const { PDFDocument, degrees } = await loadPdfLib();
      const src = await PDFDocument.load(await fixFile.arrayBuffer(), { ignoreEncryption: true });
      const total = src.getPageCount();
      const del = new Set(parsePageList(fixDeleteInput, total));
      const order = parsePageList(fixOrderInput.replace(/-/g, ","), total);
      let indices = order.length ? order.filter((i) => !del.has(i)) : src.getPageIndices().filter((i) => !del.has(i));
      // If order input given but partial, append remaining pages in order
      if (order.length) {
        const rest = src.getPageIndices().filter((i) => !del.has(i) && !order.includes(i));
        indices = [...indices, ...rest];
      }
      if (!indices.length) {
        setMessage("ไม่เหลือหน้าไหนเลย — ตรวจหน้าที่จะลบ/ลำดับใหม่");
        return;
      }
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, indices);
      const rot = ((fixRotate % 360) + 360) % 360;
      pages.forEach((p) => {
        if (rot) p.setRotation(degrees(rot));
        out.addPage(p);
      });
      downloadBytes(await out.save(), `${baseName(fixFile.name)}-fixed.pdf`);
      setMessage(`บันทึกแล้ว ${indices.length}/${total} หน้า${rot ? ` (หมุน ${rot}°)` : ""}`);
    } catch {
      setMessage("แก้ไฟล์ไม่สำเร็จ — ไฟล์อาจติดรหัสผ่าน");
    } finally {
      setFixBusy(false);
    }
  }

  // --- Batch rename ---
  async function addRenameFiles(files: File[] | FileList) {
    const arr = Array.from(files);
    if (!arr.length) return;
    const start = renameFiles.length;
    setRenameFiles((prev) => [...prev, ...arr]);
    setRenamePages((prev) => [...prev, ...arr.map(() => null)]);
    setMessage(null);
    arr.forEach(async (f, k) => {
      if (!isPdf(f)) return;
      try {
        const { PDFDocument } = await loadPdfLib();
        const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        const n = src.getPageCount();
        setRenamePages((prev) => {
          const next = [...prev];
          next[start + k] = n;
          return next;
        });
      } catch {
        /* locked/broken — leave null */
      }
    });
  }
  function extOf(name: string) {
    const m = name.match(/(\.[A-Za-z0-9]+)$/);
    return m ? m[1].toLowerCase() : "";
  }
  function previewName(i: number, orig: string) {
    const pad = Math.max(0, parseInt(renamePad, 10) || 0);
    const start = parseInt(renameStart, 10) || 1;
    const seq = String(start + i).padStart(pad, "0");
    const pre = renamePrefix.trim() ? `${renamePrefix.trim()}-` : "";
    return `${pre}${seq}${extOf(orig) || ".pdf"}`;
  }
  async function renameZip() {
    if (!renameFiles.length) {
      setMessage("เพิ่มไฟล์ก่อน");
      return;
    }
    setRenameBusy(true);
    try {
      const used = new Set<string>();
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < renameFiles.length; i++) {
        const f = renameFiles[i];
        let name = previewName(i, f.name);
        let n = 1;
        while (used.has(name)) {
          const ext = extOf(name);
          name = `${name.replace(/(\.[A-Za-z0-9]+)?$/, "")}_${n}${ext}`;
          n++;
        }
        used.add(name);
        files.push({ name, bytes: new Uint8Array(await f.arrayBuffer()) });
      }
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadZipBlob(files, `${renamePrefix.trim() || "renamed"}-${stamp}.zip`);
      setMessage(`ส่งออก ZIP แล้ว ${files.length} ไฟล์`);
    } catch {
      setMessage("ส่งออก ZIP ไม่สำเร็จ");
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6 max-w-3xl">
        <h1 className="mb-1 text-lg font-bold">เครื่องมือ</h1>
        <p className="text-xs text-neutral-500">
          ทุกอย่างประมวลผลในเบราว์เซอร์ของคุณ — ไฟล์จะไม่ถูกอัปโหลดไปที่ใด
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setActiveCat(c.key)}
                className={
                  activeCat === c.key
                    ? "rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400"
                }
              >
                {c.label}
                <span className={activeCat === c.key ? "ml-1 text-white/60" : "ml-1 text-neutral-400"}>
                  {countFor(c.key)}
                </span>
              </button>
            ))}
          </div>
          <input
            className="input w-full sm:w-56"
            placeholder="ค้นหาเครื่องมือ…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {toolVisible("merge") && (
        <ToolCard id="merge" title="รวม PDF" desc="ลากไฟล์มาวาง จัดลำดับ แล้วรวมเป็นไฟล์เดียว" open={openId === "merge"} onToggle={() => toggleTool("merge")}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setMergeDragActive(true);
            }}
            onDragLeave={() => setMergeDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setMergeDragActive(false);
              if (e.dataTransfer.files?.length) addMergeFiles(e.dataTransfer.files);
            }}
            onClick={() => mergeInputRef.current?.click()}
            className={`mb-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-8 text-center text-sm transition ${
              mergeDragActive
                ? "border-blue-500 bg-blue-50"
                : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
            }`}
          >
            <input
              ref={mergeInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addMergeFiles(e.target.files);
                e.target.value = "";
              }}
            />
            ลากไฟล์มาวาง หรือคลิกเพื่อเลือก
          </div>
          {mergeFiles.length > 0 && (
            <ol className="mb-3 space-y-1 text-sm text-neutral-600">
              {mergeFiles.map((f, i) => (
                <li key={`${i}-${f.name}-${f.size}`} className="flex items-center gap-1 rounded border border-neutral-100 px-2 py-1">
                  <span className="mr-1 text-xs text-neutral-400">{i + 1}.</span>
                  <span className="flex-1 truncate" title={f.name}>
                    {f.name}
                  </span>
                  <button className="btn !px-1.5 !py-0.5 text-xs" disabled={busy || i === 0} onClick={() => moveMergeFile(i, -1)}>
                    ↑
                  </button>
                  <button
                    className="btn !px-1.5 !py-0.5 text-xs"
                    disabled={busy || i === mergeFiles.length - 1}
                    onClick={() => moveMergeFile(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="text-neutral-400 hover:text-red-600"
                    disabled={busy}
                    onClick={() => setMergeFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={merge} disabled={busy || mergeFiles.length < 2}>
              รวมไฟล์ ({mergeFiles.length})
            </button>
            {mergeFiles.length > 0 && (
              <button className="btn-danger" onClick={() => setMergeFiles([])} disabled={busy}>
                ล้าง
              </button>
            )}
          </div>
        </ToolCard>
        )}

        {toolVisible("split") && (
        <ToolCard id="split" title="แยก PDF" desc="แยกตามช่วงหน้า หรือแยกทุกหน้าเป็น ZIP" open={openId === "split"} onToggle={() => toggleTool("split")}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setSplitDragActive(true);
            }}
            onDragLeave={() => setSplitDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSplitDragActive(false);
              if (e.dataTransfer.files?.length) addSplitFile(e.dataTransfer.files);
            }}
            onClick={() => splitInputRef.current?.click()}
            className={`mb-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-8 text-center text-sm transition ${
              splitDragActive
                ? "border-blue-500 bg-blue-50"
                : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
            }`}
          >
            <input
              ref={splitInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addSplitFile(e.target.files);
                e.target.value = "";
              }}
            />
            {splitFile ? splitFile.name : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"}
            {splitFile && (
              <div className="mt-1 text-xs text-neutral-500">
                {(splitFile.size / 1024).toFixed(0)} KB
                {splitTotal !== null ? ` • ${splitTotal} หน้า` : ""}
              </div>
            )}
          </div>
          {splitFile && (
            <button
              className="mb-3 text-xs text-neutral-500 underline hover:text-red-600"
              onClick={() => {
                setSplitFile(null);
                setSplitTotal(null);
              }}
            >
              เอาไฟล์ออก
            </button>
          )}
          <div className="mb-3 flex gap-2 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={splitMode === "ranges"}
                onChange={() => setSplitMode("ranges")}
              />
              ช่วงหน้า
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={splitMode === "every-page"}
                onChange={() => {
                  setSplitMode("every-page");
                  setSplitAsZip(true);
                }}
              />
              ทุกหน้า → ZIP
            </label>
          </div>
          {splitMode === "ranges" && (
            <>
              <label className="label">ช่วงหน้า (เช่น 1-3, 5)</label>
              <input
                className="input mb-3"
                placeholder="1-3, 5"
                value={splitRange}
                onChange={(e) => setSplitRange(e.target.value)}
              />
            </>
          )}
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={splitAsZip} onChange={(e) => setSplitAsZip(e.target.checked)} />
            ส่งออกเป็น ZIP {splitMode === "every-page" ? "(แนะนำ)" : "(กันเบราว์เซอร์บล็อกดาวน์โหลดหลายไฟล์)"}
          </label>
          <button className="btn-primary" onClick={split} disabled={busy || !splitFile}>
            แยกไฟล์
          </button>
        </ToolCard>
        )}

      {toolVisible("unlock") && (
      <ToolCard id="unlock" title="ปลดล็อก PDF" desc="ลากไฟล์ที่ติดรหัสผ่านมาวาง ระบบจะปลดล็อกและรวมเป็น ZIP ให้ดาวน์โหลด" open={openId === "unlock"} onToggle={() => toggleTool("unlock")}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files?.length) addUnlockFiles(e.dataTransfer.files);
          }}
          onClick={() => unlockInputRef.current?.click()}
          className={`mb-3 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-10 text-center text-sm transition ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
          }`}
        >
          <input
            ref={unlockInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addUnlockFiles(e.target.files);
              e.target.value = "";
            }}
          />
          ลากไฟล์ PDF มาวางที่นี่ หรือคลิกเพื่อเลือก (เลือกได้หลายไฟล์)
        </div>

        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label className="label">รหัสผ่านเดียวกันทุกไฟล์</label>
            <input
              type="text"
              className="input"
              placeholder="เช่น เลขประจำตัวผู้เสียภาษี"
              value={commonPassword}
              onChange={(e) => setCommonPassword(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <button className="btn" onClick={applyCommonPassword} disabled={!unlockItems.length}>
              ใช้กับทุกไฟล์
            </button>
            {unlockItems.length > 0 && (
              <button className="btn-danger" onClick={() => setUnlockItems([])} disabled={unlockBusy}>
                ล้าง
              </button>
            )}
          </div>
        </div>

        {unlockItems.length > 0 && (
          <div className="mb-3 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>ไฟล์</th>
                  <th className="w-44">รหัสผ่าน</th>
                  <th className="w-28">สถานะ</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {unlockItems.map((it) => (
                  <tr key={it.id}>
                    <td className="max-w-48 truncate" title={it.file.name}>
                      {it.file.name}
                      <div className="text-xs text-neutral-400">{(it.file.size / 1024).toFixed(0)} KB</div>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input !px-2 !py-1"
                        placeholder="รหัสผ่าน"
                        value={it.password}
                        disabled={unlockBusy}
                        onChange={(e) =>
                          setUnlockItems((prev) =>
                            prev.map((p) => (p.id === it.id ? { ...p, password: e.target.value, status: "idle", error: undefined } : p))
                          )
                        }
                      />
                    </td>
                    <td className="text-xs">
                      {it.status === "idle" && <span className="text-neutral-500">รอทำ</span>}
                      {it.status === "processing" && <span className="text-blue-600">กำลังทำ…</span>}
                      {it.status === "ok" && <span className="text-green-600">สำเร็จ ✓</span>}
                      {it.status === "fail" && (
                        <span className="text-red-600" title={it.error}>
                          {it.error ?? "ไม่สำเร็จ"}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="text-neutral-400 hover:text-red-600"
                        disabled={unlockBusy}
                        onClick={() => setUnlockItems((prev) => prev.filter((p) => p.id !== it.id))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={unlockAll} disabled={unlockBusy || !unlockItems.length}>
            {unlockBusy ? "กำลังปลดล็อก…" : `ปลดล็อก ${unlockItems.length || ""} ไฟล์`}
          </button>
          <button className="btn" onClick={downloadZip} disabled={unlockBusy || okCount === 0}>
            ดาวน์โหลด ZIP ({okCount} ไฟล์)
          </button>
        </div>
      </ToolCard>
      )}

      {toolVisible("subset") && (
      <ToolCard id="subset" title="จับคู่ยอดรวม" desc="วางรายการหลายยอด + ยอดเป้าหมาย หาชุดที่รวมกันได้ตรง (หรือใกล้เคียง)" open={openId === "subset"} onToggle={() => toggleTool("subset")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">รายการยอดเงิน (บรรทัดละยอด หรือวางแถวจาก Excel)</label>
            <textarea
              className="input h-40 font-mono"
              placeholder={"12,500\n3,200.50\n8,750"}
              value={subInput}
              onChange={(e) => {
                setSubInput(e.target.value);
                setSubResult(null);
              }}
            />
            {subInput.trim() && (
              <SubPreview raw={subInput} />
            )}
          </div>
          <div>
            <label className="label">ยอดเป้าหมาย</label>
            <input
              className="input mb-3 font-mono"
              inputMode="decimal"
              placeholder="เช่น 25,450"
              value={subTarget}
              onChange={(e) => {
                setSubTarget(e.target.value);
                setSubResult(null);
              }}
            />
            <label className="label">เงื่อนไขการจับคู่ยอดรวม</label>
            <div className="mb-3 flex flex-col gap-1 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={subMode === "any"}
                  onChange={() => {
                    setSubMode("any");
                    setSubResult(null);
                  }}
                />
                ยอดรวมเท่ากับเป้าหมาย หากไม่มีให้แสดงยอดที่ใกล้เคียงที่สุด
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={subMode === "max"}
                  onChange={() => {
                    setSubMode("max");
                    setSubResult(null);
                  }}
                />
                ยอดรวมต้องไม่เกินเป้าหมาย (เลือกชุดที่มียอดรวมสูงสุด)
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={subMode === "min"}
                  onChange={() => {
                    setSubMode("min");
                    setSubResult(null);
                  }}
                />
                ยอดรวมเกินเป้าหมายได้ (เลือกชุดที่มีส่วนเกินน้อยที่สุด)
              </label>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={subsetSearch} disabled={subBusy}>
                {subBusy ? "กำลังค้นหา…" : "ค้นหาชุดยอดเงิน"}
              </button>
              {(subInput || subTarget || subResult) && (
                <button
                  className="btn-danger"
                  disabled={subBusy}
                  onClick={() => {
                    setSubInput("");
                    setSubTarget("");
                    setSubResult(null);
                  }}
                >
                  ล้างข้อมูล
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              ระบบจะค้นหาชุดที่ยอดรวมตรงกับเป้าหมายในระดับสตางค์ก่อน หากไม่พบจะแสดงชุดที่ใกล้เคียงพร้อมส่วนต่าง รับรายการสูงสุด 60 รายการ และแสดงผลไม่เกิน 20 ชุด
            </p>
          </div>
        </div>
        {subResult && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-neutral-500">
              อ่าน {subResult.values.length} รายการ{subResult.invalid > 0 ? ` (ข้าม ${subResult.invalid} บรรทัดที่ไม่ใช่ตัวเลข)` : ""}
              {subResult.partial ? " • ค้นหาบางส่วน (รายการเยอะ/หมดเวลา)" : ""}
            </p>
            {subResult.exact.length > 0 ? (
              <div>
                <p className="mb-1 text-sm font-medium text-green-700">ตรงเป๊ะ {subResult.exact.length} ชุด ✓</p>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {subResult.exact.map((idxs, k) => (
                    <div key={k} className="flex items-start gap-2 rounded border border-green-200 bg-green-50 px-2 py-1 text-sm">
                      <span className="text-xs text-neutral-400">{k + 1}.</span>
                      <span className="flex-1 font-mono text-xs">
                        {idxs.map((i) => fmtMoney(subResult.values[i] ?? 0)).join(" + ")} ={" "}
                        {fmtMoney(subResult.target)}
                      </span>
                      <button
                        className="btn !px-1.5 !py-0.5 text-xs"
                        onClick={() => {
                          navigator.clipboard?.writeText(idxs.map((i) => String(subResult.values[i])).join("\n")).then(
                            () => setMessage(`คัดลอกชุดที่ ${k + 1} แล้ว (${idxs.length} รายการ)`),
                            () => setMessage("คัดลอกไม่สำเร็จ")
                          );
                        }}
                      >
                        คัดลอก
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">ไม่เจอชุดตรงเป๊ะ</p>
            )}
              {subResult.closest.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">
                    {subMode === "max"
                      ? "ใกล้เคียง (ไม่เกินเป้าหมาย)"
                      : subMode === "min"
                        ? "ใกล้เคียง (ถึงเป้าหมาย เกินน้อยสุด)"
                        : "ใกล้เคียง (ไม่ตรงเป๊ะ)"}
                  </p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {subResult.closest.map((c, k) => (
                    <div key={k} className="rounded border border-neutral-200 px-2 py-1 text-sm">
                      <span className="font-mono text-xs">
                        {c.indices.map((i) => fmtMoney(subResult.values[i] ?? 0)).join(" + ")} ={" "}
                        {fmtMoney(c.sum / 100)}
                      </span>{" "}
                      <span className={`text-xs ${c.diff > 0 ? "text-orange-600" : "text-blue-600"}`}>
                        ({c.diff > 0 ? `เกิน ${fmtMoney(c.diff / 100)}` : `ขาด ${fmtMoney(-c.diff / 100)}`})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ToolCard>
      )}

      {toolVisible("rdx") && (
      <ToolCard id="rdx" title="RDPrep Excel → RDX" desc="แปลง Excel/JSON เป็น RDX (PND3/PND53) — AES-256" open={openId === "rdx"} onToggle={() => toggleTool("rdx")}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setRdpDragActive(true);
            }}
            onDragLeave={() => setRdpDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setRdpDragActive(false);
              if (e.dataTransfer.files?.length) addRdpFile(e.dataTransfer.files);
            }}
            onClick={() => rdpInputRef.current?.click()}
            className={`mb-3 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-6 text-center text-sm transition ${
              rdpDragActive ? "border-blue-500 bg-blue-50" : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
            }`}
          >
            <input
              ref={rdpInputRef}
              type="file"
              accept=".xlsx,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addRdpFile(e.target.files);
                e.target.value = "";
              }}
            />
            {rdpFile ? rdpFile.name : "ลากไฟล์ .xlsx หรือ .json มาวาง หรือคลิกเพื่อเลือก"}
            {rdpFile && <div className="mt-1 text-xs text-neutral-500">{(rdpFile.size / 1024).toFixed(0)} KB</div>}
          </div>

          <label className="label">แบบฟอร์ม (ใช้กับไฟล์ JSON และเทมเพลต — Excel ใช้ค่าจากชีต Settings)</label>
          <div className="mb-3 flex gap-2">
            {RDX_FORMS.map((f) => (
              <button key={f} type="button" className={rdpForm === f ? "btn-primary" : "btn"} onClick={() => setRdpForm(f)}>
                {f}
              </button>
            ))}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="label">ปีที่ยื่น (พ.ศ.)</label>
              <select className="input" value={rdpYear} onChange={(e) => setRdpYear(e.target.value)}>
                {rdpYearOptions.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">เดือนที่ยื่น</label>
              <select className="input" value={rdpMonth} onChange={(e) => setRdpMonth(e.target.value)}>
                <option value="auto">อัตโนมัติจากข้อมูล</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m)}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={rdpTemplate}>
              สร้างเทมเพลต
            </button>
            <button className="btn-primary" onClick={rdpExportRdx} disabled={rdpBusy || !rdpFile}>
              {rdpBusy ? "กำลังแปลง…" : "สร้างไฟล์ RDX"}
            </button>
            <button className="btn" onClick={rdpExportJson} disabled={rdpBusy || !rdpFile}>
              สร้าง JSON (ZIP)
            </button>
            {(rdpFile || rdpResult) && (
              <button
                className="btn-danger"
                disabled={rdpBusy}
                onClick={() => {
                  setRdpFile(null);
                  setRdpResult(null);
                  setRdpStatus(null);
                }}
              >
                ล้าง
              </button>
            )}
          </div>

          {rdpResult && (
            <div className="mt-3 rounded bg-neutral-50 p-2 text-xs">
              <div>
                ฐานไฟล์: <span className="font-mono">{rdpResult.base}</span>
              </div>
              <div>
                แบบฟอร์ม: {rdpResult.formCode} • สาขา: {rdpResult.branchType}
              </div>
              <div>
                รายรับรวม: {rdpResult.totalIncome.toLocaleString("th-TH", { minimumFractionDigits: 2 })} • ภาษีรวม:{" "}
                {rdpResult.totalTax.toLocaleString("th-TH", { minimumFractionDigits: 2 })} • ผู้รับ: {rdpResult.recipients}
              </div>
            </div>
          )}
          {rdpStatus && <p className="mt-2 text-xs text-neutral-600">{rdpStatus}</p>}
      </ToolCard>
      )}

      {toolVisible("vat") && (
      <ToolCard id="vat" title="VAT / หัก ณ ที่จ่าย / ตัวอักษร" desc="คำนวณในเบราว์เซอร์ ไม่บันทึกข้อมูล" open={openId === "vat"} onToggle={() => toggleTool("vat")}>
          <label className="label">ยอดเงิน</label>
          <input className="input mb-2" inputMode="decimal" placeholder="เช่น 10000" value={vatInput} onChange={(e) => setVatInput(e.target.value)} />
          <div className="mb-2 flex gap-2 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={vatMode === "exclusive"} onChange={() => setVatMode("exclusive")} />
              ยังไม่รวม VAT
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={vatMode === "inclusive"} onChange={() => setVatMode("inclusive")} />
              รวม VAT แล้ว
            </label>
          </div>
          <div className="mb-3 rounded bg-neutral-50 p-2 text-sm">
            <div>ฐานภาษี: {vatBase.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</div>
            <div>VAT 7%: {vatTax.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</div>
            <div className="font-medium">รวม: {vatTotal.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="mb-2 flex gap-2">
            <div className="flex-1">
              <label className="label">ยอดก่อนหักภาษี</label>
              <input className="input" inputMode="decimal" placeholder="เช่น 50000" value={whtInput} onChange={(e) => setWhtInput(e.target.value)} />
            </div>
            <div className="w-28">
              <label className="label">อัตรา %</label>
              <input className="input" inputMode="decimal" list="wht-rates" value={whtRate} onChange={(e) => setWhtRate(e.target.value)} />
              <datalist id="wht-rates">
                <option value="1" />
                <option value="1.5" />
                <option value="2" />
                <option value="3" />
                <option value="5" />
                <option value="10" />
                <option value="15" />
              </datalist>
            </div>
          </div>
          <div className="mb-3 rounded bg-neutral-50 p-2 text-sm">
            <div>ภาษีหัก: {whtTax.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</div>
            <div className="font-medium">จ่ายสุทธิ: {(whtAmt - whtTax).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</div>
          </div>
          <label className="label">จำนวนเงิน → ตัวอักษร</label>
          <input className="input mb-1" inputMode="decimal" placeholder="เช่น 12345.50" value={bahtInput} onChange={(e) => setBahtInput(e.target.value)} />
          {bahtText && <p className="rounded bg-neutral-50 p-2 text-sm">{bahtText}</p>}
      </ToolCard>
      )}

      {toolVisible("taxid") && (
      <ToolCard id="taxid" title="เช็คเลขผู้เสียภาษี 13 หลัก" desc="วางได้หลายเลข (บรรทัดละเลข หรือคั่นด้วยจุลภาค)" open={openId === "taxid"} onToggle={() => toggleTool("taxid")}>
          <textarea
            className="input mb-2 h-24 font-mono"
            placeholder={"1234567890123\n3100600123456"}
            value={taxIds}
            onChange={(e) => setTaxIds(e.target.value)}
          />
          {taxRows.length > 0 && (
            <>
              <p className="mb-2 text-sm">ผ่าน {taxOkCount}/{taxRows.length}</p>
              <div className="mb-2 max-h-48 overflow-y-auto">
                <table className="table-base">
                  <tbody>
                    {taxRows.map((r, i) => (
                      <tr key={`${i}-${r.raw}`}>
                        <td className="font-mono text-xs">{r.digits.length === 13 ? formatTaxId(r.digits) : r.raw}</td>
                        <td className="text-xs">{r.ok ? <span className="text-green-600">✓ ถูกต้อง</span> : <span className="text-red-600">✕ {r.reason}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="btn"
                onClick={() => {
                  const ok = taxRows.filter((r) => r.ok).map((r) => formatTaxId(r.digits));
                  navigator.clipboard?.writeText(ok.join("\n")).then(
                    () => setMessage(`คัดลอกเลขที่ถูก ${ok.length} เลขแล้ว`),
                    () => setMessage("คัดลอกไม่สำเร็จ")
                  );
                }}
              >
                คัดลอกเลขที่ถูก ({taxOkCount})
              </button>
            </>
          )}
      </ToolCard>
      )}

      {toolVisible("fix") && (
      <ToolCard id="fix" title="หมุน / ลบ / จัดหน้า PDF" desc="แก้สแกนเอียง ตัดหน้าว่าง แล้วบันทึกเป็นไฟล์เดียว" open={openId === "fix"} onToggle={() => toggleTool("fix")}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setFixDragActive(true);
            }}
            onDragLeave={() => setFixDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setFixDragActive(false);
              const f = Array.from(e.dataTransfer.files ?? []).find(isPdf);
              if (f) setFixFileWithInfo(f);
            }}
            onClick={() => fixInputRef.current?.click()}
            className={`mb-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-8 text-center text-sm transition ${
              fixDragActive ? "border-blue-500 bg-blue-50" : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
            }`}
          >
            <input
              ref={fixInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFixFileWithInfo(f);
                e.target.value = "";
              }}
            />
            {fixFile ? fixFile.name : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"}
            {fixTotal !== null && <div className="mt-1 text-xs text-neutral-500">{fixTotal} หน้า</div>}
          </div>
          <label className="label">หมุนทุกหน้า (องศา)</label>
          <div className="mb-3 flex gap-1">
            {[0, 90, 180, 270].map((d) => (
              <button key={d} className={fixRotate === d ? "btn-primary" : "btn"} onClick={() => setFixRotate(d)}>
                {d}°
              </button>
            ))}
          </div>
          <label className="label">ลบหน้า (เช่น 2, 5-6)</label>
          <input className="input mb-3" placeholder="เว้นว่าง = ไม่ลบ" value={fixDeleteInput} onChange={(e) => setFixDeleteInput(e.target.value)} />
          <label className="label">ลำดับใหม่ (เช่น 3,1,2 — เว้นว่าง = เดิม)</label>
          <input className="input mb-3" placeholder="เว้นว่าง = ลำดับเดิม" value={fixOrderInput} onChange={(e) => setFixOrderInput(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={fixExport} disabled={fixBusy || !fixFile}>
              {fixBusy ? "กำลังทำ…" : "บันทึกไฟล์"}
            </button>
            {fixFile && (
              <button
                className="btn-danger"
                disabled={fixBusy}
                onClick={() => {
                  setFixFile(null);
                  setFixTotal(null);
                }}
              >
                ล้าง
              </button>
            )}
          </div>
      </ToolCard>
      )}

      {toolVisible("rename") && (
      <ToolCard id="rename" title="เปลี่ยนชื่อเป็นชุด → ZIP" desc="ลากไฟล์หลายไฟล์ ดูนับหน้า แล้วส่งออกชื่อใหม่เป็น ZIP" open={openId === "rename"} onToggle={() => toggleTool("rename")}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setRenameDragActive(true);
            }}
            onDragLeave={() => setRenameDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setRenameDragActive(false);
              if (e.dataTransfer.files?.length) addRenameFiles(e.dataTransfer.files);
            }}
            onClick={() => renameInputRef.current?.click()}
            className={`mb-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-8 text-center text-sm transition ${
              renameDragActive ? "border-blue-500 bg-blue-50" : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
            }`}
          >
            <input
              ref={renameInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addRenameFiles(e.target.files);
                e.target.value = "";
              }}
            />
            ลากไฟล์มาวาง หรือคลิกเพื่อเลือก ({renameFiles.length} ไฟล์)
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div>
              <label className="label">คำนำหน้า</label>
              <input className="input" placeholder="เช่น ACME-2026-08" value={renamePrefix} onChange={(e) => setRenamePrefix(e.target.value)} />
            </div>
            <div>
              <label className="label">เริ่มที่</label>
              <input className="input" inputMode="numeric" value={renameStart} onChange={(e) => setRenameStart(e.target.value)} />
            </div>
            <div>
              <label className="label">หลักเลข</label>
              <input className="input" inputMode="numeric" value={renamePad} onChange={(e) => setRenamePad(e.target.value)} />
            </div>
          </div>
          {renameFiles.length > 0 && (
            <div className="mb-3 max-h-48 overflow-y-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>เดิม</th>
                    <th>ชื่อใหม่</th>
                    <th className="w-14">หน้า</th>
                  </tr>
                </thead>
                <tbody>
                  {renameFiles.map((f, i) => (
                    <tr key={`${i}-${f.name}-${f.size}`}>
                      <td className="max-w-28 truncate text-xs" title={f.name}>
                        {f.name}
                      </td>
                      <td className="font-mono text-xs">{previewName(i, f.name)}</td>
                      <td className="text-center text-xs">{isPdf(f) ? (renamePages[i] ?? "…") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={renameZip} disabled={renameBusy || !renameFiles.length}>
              {renameBusy ? "กำลังทำ…" : `ส่งออก ZIP (${renameFiles.length})`}
            </button>
            {renameFiles.length > 0 && (
              <button
                className="btn-danger"
                disabled={renameBusy}
                onClick={() => {
                  setRenameFiles([]);
                  setRenamePages([]);
                }}
              >
                ล้าง
              </button>
            )}
          </div>
      </ToolCard>
      )}
      </div>

      {countFor(activeCat) === 0 && (
        <p className="mt-6 max-w-3xl text-sm text-neutral-500">
          ไม่พบเครื่องมือที่ตรงกับการค้นหา
        </p>
      )}

      {message && (
        <p className="mt-4 max-w-3xl rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          {message}
        </p>
      )}
    </>
  );
}
