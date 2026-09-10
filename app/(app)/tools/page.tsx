"use client";

import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { PDFDocument as SecurePDFDocument } from "@cantoo/pdf-lib";
import JSZip from "jszip";

type UnlockItem = {
  id: string;
  file: File;
  password: string;
  status: "idle" | "processing" | "ok" | "fail";
  error?: string;
  bytes?: Uint8Array;
};

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

  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">เครื่องมือ</h1>
      <p className="mb-6 text-xs text-neutral-500">
        ทุกอย่างประมวลผลในเบราว์เซอร์ของคุณ — ไฟล์จะไม่ถูกอัปโหลดไปที่ใด
      </p>

      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
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

      {message && <p className="mt-4 text-sm">{message}</p>}
    </>
  );
}
