"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveIntakeSubmission,
  createIntakeLink,
  getIntakeFileUrl,
  listIntakeLinks,
  listIntakeSubmissions,
  rejectIntakeSubmission,
  revokeIntakeLink,
  type IntakeLinkRow,
  type IntakeSubmissionRow,
} from "@/lib/actions/intake";
import { formatTaxId } from "@/lib/tax-id";

function badge(status: string | null) {
  const map: Record<string, string> = {
    submitted: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-red-50 text-red-600",
  };
  const label: Record<string, string> = {
    submitted: "รอตรวจสอบ",
    approved: "อนุมัติแล้ว",
    rejected: "ปฏิเสธ",
  };
  if (!status) return <span className="text-xs text-neutral-400">รอกรอก</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-neutral-100 text-neutral-600"}`}>
      {label[status] ?? status}
    </span>
  );
}

export default function OnboardingPage() {
  const [links, setLinks] = useState<IntakeLinkRow[]>([]);
  const [subs, setSubs] = useState<IntakeSubmissionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([listIntakeLinks(), listIntakeSubmissions()]);
    setLinks(l);
    setSubs(s);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function makeLink() {
    const label = prompt("ชื่อ/ป้ายกำกับลิงก์นี้ (เช่น ชื่อบริษัทผู้สนใจ) — เว้นว่างได้") ?? "";
    setBusy(true);
    setMessage("");
    try {
      const res = await createIntakeLink(label);
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      await navigator.clipboard.writeText(res.url).catch(() => undefined);
      setMessage("สร้างลิงก์แล้ว (คัดลอกไปวางส่งให้ผู้สนใจได้เลย)");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setMessage("คัดลอกลิงก์แล้ว");
  }

  async function revoke(id: string) {
    if (!confirm("ยกเลิกลิงก์นี้?")) return;
    setBusy(true);
    try {
      const res = await revokeIntakeLink(id);
      if (!res.ok) setMessage(res.error);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function preview(path: string) {
    if (files[path]) {
      window.open(files[path], "_blank", "noopener");
      return;
    }
    const url = await getIntakeFileUrl(path);
    if (!url) {
      setMessage("เปิดไฟล์ไม่สำเร็จ");
      return;
    }
    setFiles((p) => ({ ...p, [path]: url }));
    window.open(url, "_blank", "noopener");
  }

  async function approve(id: string) {
    if (!confirm("อนุมัติคำขอนี้ และสร้างเป็นลูกค้า?")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await approveIntakeSubmission(id);
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setMessage(res.duplicate ? "มีลูกค้าเลขนี้อยู่แล้ว — เชื่อมโยงให้แล้ว" : "อนุมัติและสร้างลูกค้าแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    if (!confirm("ปฏิเสธคำขอนี้?")) return;
    setBusy(true);
    try {
      const res = await rejectIntakeSubmission(id);
      if (!res.ok) setMessage(res.error);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pending = subs.filter((s) => s.status === "submitted");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">ลงทะเบียนลูกค้า</h1>
          <p className="text-xs text-neutral-500">
            ส่งลิงก์ให้ผู้สนใจกรอกข้อมูลบริษัท แล้วตรวจสอบเพื่อสร้างเป็นลูกค้า
          </p>
        </div>
        <button className="btn-primary" onClick={makeLink} disabled={busy}>
          สร้างลิงก์ลงทะเบียน
        </button>
      </div>

      {message && (
        <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          {message}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">คำขอรอตรวจสอบ ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-neutral-500">ยังไม่มีคำขอใหม่</p>}
        {pending.map((s) => {
          const open = openSub === s.id;
          const docs: { label: string; path: string | null }[] = [
            { label: "ทะเบียนบ้าน (ที่ตั้งบริษัท)", path: s.company_house_path },
            ...s.shareholders.flatMap((sh, i) => [
              { label: `ผู้ถือหุ้น #${i + 1} บัตรประชาชน (${sh.name})`, path: sh.idCardPath || null },
              { label: `ผู้ถือหุ้น #${i + 1} ทะเบียนบ้าน (${sh.name})`, path: sh.houseRegPath || null },
            ]),
            { label: `ลายเซ็น (${s.signer_name || "ผู้ลงนาม"})`, path: s.signature_path },
          ];
          return (
            <div key={s.id} className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{s.name_th}</div>
                  <div className="text-xs text-neutral-500">
                    เลขทะเบียน {formatTaxId(s.juristic_id)} · ผู้ติดต่อ {s.contact_name} · {s.contact_phone}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {badge(s.status)}
                  <button className="btn text-xs" onClick={() => setOpenSub(open ? null : s.id)}>
                    {open ? "ย่อ" : "ดูรายละเอียด"}
                  </button>
                </div>
              </div>

              {open && (
                <div className="space-y-2 border-t border-neutral-100 pt-3 text-sm">
                  <div className="grid gap-1 sm:grid-cols-2">
                    <div>ชื่ออังกฤษ: {s.name_en || "-"}</div>
                    <div>ชื่อสำรอง: {s.name_th2 || "-"}</div>
                    <div>จด VAT: {s.vat_registered ? "ใช่" : "ไม่ใช่"}</div>
                    <div>รอบบัญชี: {s.fiscal_year_end || "-"}</div>
                    <div className="sm:col-span-2">
                      ที่อยู่:{" "}
                      {[s.addr_line, s.addr_moo, s.addr_soi, s.addr_road, s.addr_subdistrict, s.addr_district, s.addr_province, s.addr_postcode]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </div>
                    <div className="sm:col-span-2">ประเภทธุรกิจ: {s.business_desc || "-"}</div>
                    {s.filings.length > 0 && <div className="sm:col-span-2">แบบที่ยื่น: {s.filings.join(", ")}</div>}
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-medium text-neutral-500">ผู้ถือหุ้น ({s.shareholders.length})</div>
                    <ul className="list-inside list-disc text-xs text-neutral-600">
                      {s.shareholders.map((sh, i) => (
                        <li key={i}>
                          {sh.name} {sh.percent && `· ${sh.percent}%`} {sh.isDirector && "· กรรมการ"} · {sh.phone} · {sh.email}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {docs
                      .filter((d) => d.path)
                      .map((d, i) => (
                        <button key={i} className="btn text-xs" onClick={() => preview(d.path!)}>
                          เปิด: {d.label}
                        </button>
                      ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button className="btn-primary text-xs" onClick={() => approve(s.id)} disabled={busy}>
                      อนุมัติ → สร้างลูกค้า
                    </button>
                    <button className="btn-danger text-xs" onClick={() => reject(s.id)} disabled={busy}>
                      ปฏิเสธ
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">ประวัติการตรวจสอบ</h2>
        {subs.filter((s) => s.status !== "submitted").length === 0 && (
          <p className="text-sm text-neutral-500">ยังไม่มีรายการ</p>
        )}
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>บริษัท</th>
                <th>เลขทะเบียน</th>
                <th>สถานะ</th>
                <th>ผู้ตรวจ</th>
                <th>วันที่</th>
              </tr>
            </thead>
            <tbody>
              {subs
                .filter((s) => s.status !== "submitted")
                .map((s) => (
                  <tr key={s.id}>
                    <td>{s.name_th}</td>
                    <td className="font-mono text-xs">{formatTaxId(s.juristic_id)}</td>
                    <td>{badge(s.status)}</td>
                    <td className="text-xs">{s.reviewed_by ?? "-"}</td>
                    <td className="text-xs">{s.reviewed_at ? new Date(s.reviewed_at).toLocaleString("th-TH") : "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">ลิงก์ที่สร้าง ({links.length})</h2>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>ป้ายกำกับ</th>
                <th>สถานะ</th>
                <th>หมดอายุ</th>
                <th className="w-40">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const expired = l.expires_at ? new Date(l.expires_at).getTime() < Date.now() : false;
                return (
                  <tr key={l.id}>
                    <td className="text-sm">{l.label || "—"}</td>
                    <td>{l.revoked_at ? <span className="text-xs text-red-500">ยกเลิก</span> : badge(l.submission_status)}</td>
                    <td className="text-xs text-neutral-500">
                      {l.expires_at ? new Date(l.expires_at).toLocaleDateString("th-TH") : "-"}
                      {expired && !l.revoked_at && <span className="ml-1 text-amber-600">(หมดอายุ)</span>}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn text-xs" onClick={() => copy(l.url)} disabled={Boolean(l.revoked_at)}>
                          คัดลอก
                        </button>
                        {!l.revoked_at && (
                          <button className="btn-danger text-xs" onClick={() => revoke(l.id)} disabled={busy}>
                            ยกเลิก
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
