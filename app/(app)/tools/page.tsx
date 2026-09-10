"use client";

import { useRef, useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import { PDFDocument as SecurePDFDocument } from "@cantoo/pdf-lib";
import JSZip from "jszip";
import { thaiBahtText } from "@/lib/thai-baht-text";

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

function OtherTool({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <details className="card group">
      <summary className="cursor-pointer list-none">
        <span className="flex items-center justify-between gap-2">
          <span>
            <span className="block font-medium">{title}</span>
            <span className="block text-xs text-neutral-500">{desc}</span>
          </span>
          <span className="btn shrink-0 group-open:hidden">เปิด</span>
          <span className="btn hidden shrink-0 group-open:inline-block">ปิด</span>
        </span>
      </summary>
      <div className="mt-3 border-t border-neutral-100 pt-3">{children}</div>
    </details>
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
  const [subBusy, setSubBusy] = useState(false);
  const [subResult, setSubResult] = useState<{
    exact: number[][];
    closest: { indices: number[]; sum: number; diff: number }[];
    values: number[];
    target: number;
    invalid: number;
    partial: boolean;
  } | null>(null);

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
        function consider(sum: number) {
          if (!chosen.length) return;
          const diff = sum - t;
          const key = [...chosen].sort((a, b) => a - b).join(",");
          if (diff === 0) {
            if (seen.has("e" + key) || exact.length >= 20) return;
            seen.add("e" + key);
            exact.push(chosen.map((p) => order[p].i).sort((a, b) => a - b));
          } else {
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
        // For n > 30 full DFS explodes — use DP first for one exact + nearest, then bounded DFS
        if (n > 30) {
          const dp = new Map<number, number[]>();
          dp.set(0, []);
          for (let i = 0; i < n; i++) {
            const snap = [...dp.entries()];
            for (const [s, idxs] of snap) {
              const ns = s + sv[i];
              if (!dp.has(ns)) dp.set(ns, [...idxs, i]);
              if (dp.size > 300000) break;
            }
            if (dp.size > 300000) {
              partial = true;
              break;
            }
          }
          if (dp.has(t)) {
            const idxs = dp.get(t)!;
            if (idxs.length) {
              const mapped = idxs.map((p) => order[p].i).sort((a, b) => a - b);
              seen.add("e" + mapped.join(","));
              exact.push(mapped);
            }
            /* empty subset (t === 0) is not useful — ignore */
          }
          let best: number | null = null;
          let bestDiff = Infinity;
          for (const s of dp.keys()) {
            const d = Math.abs(s - t);
            if (d < bestDiff && d !== 0) {
              bestDiff = d;
              best = s;
            }
          }
          if (best !== null) {
            const idxs = dp.get(best)!;
            if (idxs.length)
              closest.push({
                indices: idxs.map((p) => order[p].i).sort((a, b) => a - b),
                sum: best,
                diff: best - t,
              });
          }
          // Bounded DFS for more exact alternatives with tight deadline
          if (exact.length) {
            const dfsDeadline = Date.now() + 600;
            const dfs2 = (pos: number, sum: number): boolean => {
              if (Date.now() > dfsDeadline || exact.length >= 20) return true;
              if (pos === n) {
                if (sum === t && chosen.length) {
                  const mapped = chosen.map((p) => order[p].i).sort((a, b) => a - b);
                  const mkey = mapped.join(",");
                  if (!seen.has("e" + mkey)) {
                    seen.add("e" + mkey);
                    exact.push(mapped);
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
        if (exact.length) setMessage(`เจอชุดที่ตรงเป๊ะ ${exact.length} ชุด จาก ${values.length} รายการ`);
        else if (closest.length) setMessage(`ไม่เจอชุดตรงเป๊ะ — แสดง ${closest.length} ชุดใกล้เคียง`);
        else setMessage("ไม่เจอชุดใดเลย");
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
      <h1 className="mb-1 text-lg font-semibold">เครื่องมือ</h1>
      <p className="mb-6 text-xs text-neutral-500">
        ทุกอย่างประมวลผลในเบราว์เซอร์ของคุณ — ไฟล์จะไม่ถูกอัปโหลดไปที่ใด
      </p>

      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        <section className="card">
          <h2 className="mb-1 font-medium">รวม PDF</h2>
          <p className="mb-3 text-xs text-neutral-500">ลากไฟล์มาวาง จัดลำดับ แล้วรวมเป็นไฟล์เดียว</p>
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
            className={`mb-3 cursor-pointer rounded border-2 border-dashed p-4 text-center text-sm transition ${
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
        </section>

        <section className="card">
          <h2 className="mb-1 font-medium">แยก PDF</h2>
          <p className="mb-3 text-xs text-neutral-500">แยกตามช่วงหน้า หรือแยกทุกหน้าเป็น ZIP</p>
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
            className={`mb-3 cursor-pointer rounded border-2 border-dashed p-4 text-center text-sm transition ${
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
        </section>
      </div>

      <section className="card mt-6 max-w-3xl">
        <h2 className="mb-1 font-medium">ปลดล็อก PDF (หลายไฟล์ → ZIP)</h2>
        <p className="mb-3 text-xs text-neutral-500">
          ลากไฟล์ PDF ที่ติดรหัสผ่านมาวาง แล้วใส่รหัสผ่าน ระบบจะปลดล็อกและรวมเป็น ZIP ให้ดาวน์โหลด
        </p>

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
          className={`mb-3 cursor-pointer rounded border-2 border-dashed p-6 text-center text-sm transition ${
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
      </section>

      <section className="card mt-6 max-w-3xl">
        <h2 className="mb-1 font-medium">จับคู่ยอดรวม (Subset Sum)</h2>
        <p className="mb-3 text-xs text-neutral-500">
          วางรายการหลายยอด + ยอดเป้าหมาย หาชุดที่รวมกันได้ตรง (หรือใกล้เคียง)
        </p>
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
            <div className="flex gap-2">
              <button className="btn-primary" onClick={subsetSearch} disabled={subBusy}>
                {subBusy ? "กำลังค้นหา…" : "ค้นหาชุดยอด"}
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
                  ล้าง
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              ตรงเป๊ะระดับสตางค์ก่อน ถ้าไม่มีจะแสดงชุดใกล้เคียง + ส่วนต่าง สูงสุด 60 รายการ แสดงไม่เกิน 20 ชุด
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
                <p className="mb-1 text-sm font-medium">ใกล้เคียง (ไม่ตรงเป๊ะ)</p>
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
      </section>

      <h2 className="mb-3 mt-8 max-w-3xl font-medium text-neutral-600">เครื่องมืออื่น ๆ</h2>
      <div className="grid max-w-3xl grid-cols-1 gap-4">
        <OtherTool title="VAT / หัก ณ ที่จ่าย / ตัวอักษร" desc="คำนวณในเบราว์เซอร์ ไม่บันทึกข้อมูล">
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
        </OtherTool>

        <OtherTool title="เช็คเลขผู้เสียภาษี 13 หลัก" desc="วางได้หลายเลข (บรรทัดละเลข หรือคั่นด้วยจุลภาค)">
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
        </OtherTool>

        <OtherTool title="หมุน / ลบ / จัดหน้า PDF" desc="แก้สแกนเอียง ตัดหน้าว่าง แล้วบันทึกเป็นไฟล์เดียว">
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
            className={`mb-3 cursor-pointer rounded border-2 border-dashed p-4 text-center text-sm transition ${
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
        </OtherTool>

        <OtherTool title="เปลี่ยนชื่อเป็นชุด → ZIP" desc="ลากไฟล์หลายไฟล์ ดูนับหน้า แล้วส่งออกชื่อใหม่เป็น ZIP">
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
            className={`mb-3 cursor-pointer rounded border-2 border-dashed p-4 text-center text-sm transition ${
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
        </OtherTool>

      </div>

      {message && <p className="mt-4 text-sm">{message}</p>}
    </>
  );
}
