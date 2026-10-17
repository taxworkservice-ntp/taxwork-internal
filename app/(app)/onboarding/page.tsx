"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createIntakeLink,
  getIntakeFileUrl,
  listIntakeLinks,
  listIntakeSubmissions,
  rejectIntakeSubmission,
  revokeIntakeLink,
  sendTestLineNotify,
  type IntakeLinkRow,
  type IntakeSubmissionRow,
} from "@/lib/actions/intake";
import { formatTaxId } from "@/lib/tax-id";
import { shareholderIdDocs } from "@/lib/intake-shared";
import IntakeModal, { badge, type IntakeDoc } from "@/components/intake-modal";

export default function OnboardingPage() {
  const [links, setLinks] = useState<IntakeLinkRow[]>([]);
  const [subs, setSubs] = useState<IntakeSubmissionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [docsLoading, setDocsLoading] = useState(false);

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([listIntakeLinks(), listIntakeSubmissions()]);
    setLinks(l);
    setSubs(s);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
    try {
      const id = new URLSearchParams(window.location.search).get("view");
      if (id) setViewId(id);
    } catch {
      // ignore
    }
  }, [load]);

  function openView(id: string) {
    setViewId(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", id);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }

  function closeView() {
    setViewId(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }

  async function makeLink() {
    const label = prompt("ชื่อ/ป้ายกำกับลิงก์นี้ (เช่น ชื่อบริษัทผู้สนใจ) — เว้นว่างได้");
    if (label === null) return; // Cancel pressed — do not create.
    setBusy(true);
    setMessage("");
    try {
      const res = await createIntakeLink(label || "");
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

  async function testLine() {
    setBusy(true);
    setMessage("");
    try {
      const res = await sendTestLineNotify();
      setMessage(res.ok ? "ส่งข้อความทดสอบไป LINE แล้ว — ตรวจสอบในแอป LINE" : res.error);
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
  const viewing = subs.find((s) => s.id === viewId) ?? null;

  const viewingDocs: IntakeDoc[] = viewing
    ? [
        { label: "ทะเบียนบ้าน (ที่ตั้งบริษัท)", path: viewing.company_house_path },
        { label: "แผนที่ Google Maps", path: viewing.company_map_path },
        ...viewing.shareholders.flatMap((sh, i) => {
          const { front, back } = shareholderIdDocs(sh);
          if (front && back && front !== back)
            return [
              { label: `ผู้ถือหุ้น #${i + 1} บัตรประชาชนด้านหน้า (${sh.name})`, path: front },
              { label: `ผู้ถือหุ้น #${i + 1} บัตรประชาชนด้านหลัง (${sh.name})`, path: back },
            ];
          return [{ label: `ผู้ถือหุ้น #${i + 1} บัตรประชาชน (${sh.name})`, path: front || null }];
        }),
        { label: `ลายเซ็น (${viewing.signer_name || "ผู้ลงนาม"})`, path: viewing.signature_path },
      ]
    : [];

  useEffect(() => {
    if (!viewing) return;
    let cancelled = false;
    setDocsLoading(true);
    (async () => {
      const missing = viewingDocs.map((d) => d.path).filter((p): p is string => Boolean(p));
      const fresh: Record<string, string> = {};
      await Promise.all(
        missing.map(async (p) => {
          if (files[p]) return;
          const url = await getIntakeFileUrl(p);
          if (url && !cancelled) fresh[p] = url;
        })
      );
      if (!cancelled) {
        if (Object.keys(fresh).length) setFiles((prev) => ({ ...prev, ...fresh }));
        setDocsLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setDocsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.id]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">จดทะเบียนบริษัท</h1>
          <p className="text-xs text-neutral-500">
            ส่งลิงก์ให้ผู้สนใจกรอกข้อมูล แล้วใช้จดทะเบียนบริษัทกับ DBD
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={testLine} disabled={busy} title="ส่งข้อความทดสอบไปยัง LINE ของผู้ดูแล">
            ทดสอบแจ้งเตือน LINE
          </button>
          <button className="btn-primary" onClick={makeLink} disabled={busy}>
            สร้างลิงก์ลงทะเบียน
          </button>
        </div>
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
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => openView(s.id)}
              className="card block w-full space-y-1 text-left transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-blue-600 hover:underline">{s.name_th}</div>
                  <div className="text-xs text-neutral-500">
                    {s.juristic_id ? `เลขทะเบียน ${formatTaxId(s.juristic_id)}` : "รอจดทะเบียน"} · ผู้ติดต่อ{" "}
                    {s.contact_name} · {s.contact_phone}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {badge(s.status, Boolean(s.client_id), Boolean(s.tax_id_issued))}
                  <span className="text-xs text-neutral-400">เปิด →</span>
                </div>
              </div>
              <div className="text-xs text-neutral-400">
                ผู้ถือหุ้น {s.shareholders.length} คน · เอกสาร {[
                  s.company_house_path,
                  s.company_map_path,
                  ...s.shareholders.flatMap((sh) => {
                    const { front, back } = shareholderIdDocs(sh);
                    return front && back && front !== back ? [front, back] : [front];
                  }),
                  s.signature_path,
                ].filter(Boolean).length} ไฟล์ — แตะเพื่อดูรูปและรายละเอียด
              </div>
            </button>
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
                  <tr
                    key={s.id}
                    onClick={() => openView(s.id)}
                    className="cursor-pointer transition-colors hover:bg-neutral-50"
                  >
                    <td>
                      <span className="text-blue-600 hover:underline">{s.name_th}</span>
                    </td>
                    <td className="font-mono text-xs">
                      {s.juristic_id ? formatTaxId(s.juristic_id) : "—"}
                    </td>
                    <td>{badge(s.status, Boolean(s.client_id), Boolean(s.tax_id_issued))}</td>
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
                    <td>
                      {l.revoked_at ? (
                        <span className="text-xs text-red-500">ยกเลิก</span>
                      ) : l.submission_status ? (
                        <span className="text-xs text-neutral-500">ส่งแล้ว</span>
                      ) : (
                        <span className="text-xs text-neutral-400">รอกรอก</span>
                      )}
                    </td>
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

      <IntakeModal
        sub={viewing}
        docs={viewingDocs.map((d) => ({ ...d, url: d.path ? files[d.path] : null }))}
        loadingDocs={docsLoading}
        onClose={closeView}
        onOpenDoc={preview}
        onReject={reject}
        busy={busy}
      />
    </div>
  );
}
