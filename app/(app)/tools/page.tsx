"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";

export default function ToolsPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitRange, setSplitRange] = useState("");

  async function merge() {
    if (mergeFiles.length < 2) {
      setMessage("เลือกไฟล์ PDF อย่างน้อย 2 ไฟล์");
      return;
    }
    setBusy(true);
    try {
      const out = await PDFDocument.create();
      for (const file of mergeFiles) {
        const src = await PDFDocument.load(await file.arrayBuffer());
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      downloadBytes(bytes, "merged.pdf");
      setMessage(`รวม ${mergeFiles.length} ไฟล์แล้ว`);
      setMergeFiles([]);
    } catch {
      setMessage("รวมไฟล์ไม่สำเร็จ — ตรวจสอบว่าไฟล์เป็น PDF ที่ถูกต้อง");
    }
    setBusy(false);
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

  async function split() {
    if (!splitFile) {
      setMessage("Choose a PDF to split.");
      return;
    }
    setBusy(true);
    try {
      const src = await PDFDocument.load(await splitFile.arrayBuffer());
      const total = src.getPageCount();
      const groups = parseRanges(splitRange, total);
      if (!groups.length) {
        setMessage(`กรอกช่วงหน้า เช่น "1-3,5" (ไฟล์นี้มี ${total} หน้า)`);
        setBusy(false);
        return;
      }
      for (const g of groups) {
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, g);
        pages.forEach((p) => out.addPage(p));
        downloadBytes(await out.save(), `split-${g.map((i) => i + 1).join("-")}.pdf`);
      }
      setMessage(`สร้าง ${groups.length} ไฟล์แล้ว`);
    } catch {
      setMessage("แยกไฟล์ไม่สำเร็จ — PDF หรือช่วงหน้าไม่ถูกต้อง");
    }
    setBusy(false);
  }

  function downloadBytes(bytes: Uint8Array, name: string) {
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">เครื่องมือ</h1>
      <p className="mb-6 text-xs text-neutral-500">
        ทุกอย่างประมวลผลในเบราว์เซอร์ของคุณ — ไฟล์จะไม่ถูกอัปโหลดไปที่ใด
      </p>

      <div className="grid max-w-3xl grid-cols-2 gap-6">
        <section className="card">
          <h2 className="mb-3 font-medium">รวม PDF</h2>
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="mb-3 block text-sm"
            onChange={(e) => setMergeFiles(Array.from(e.target.files ?? []))}
          />
          {mergeFiles.length > 0 && (
            <ol className="mb-3 list-decimal pl-5 text-sm text-neutral-600">
              {mergeFiles.map((f) => (
                <li key={f.name}>{f.name}</li>
              ))}
            </ol>
          )}
          <button className="btn-primary" onClick={merge} disabled={busy}>
            รวมไฟล์
          </button>
        </section>

        <section className="card">
          <h2 className="mb-3 font-medium">แยก PDF</h2>
          <input
            type="file"
            accept="application/pdf"
            className="mb-3 block text-sm"
            onChange={(e) => setSplitFile(e.target.files?.[0] ?? null)}
          />
          <label className="label">ช่วงหน้า (เช่น 1-3, 5)</label>
          <input
            className="input mb-3"
            placeholder="1-3, 5"
            value={splitRange}
            onChange={(e) => setSplitRange(e.target.value)}
          />
          <button className="btn-primary" onClick={split} disabled={busy}>
            แยกไฟล์
          </button>
        </section>
      </div>

      {message && <p className="mt-4 text-sm">{message}</p>}
    </>
  );
}
