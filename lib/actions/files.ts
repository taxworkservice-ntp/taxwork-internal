"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { num } from "./db-helpers";

export type FileRow = {
  id: string;
  client_id: string | null;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
  note: string | null;
  clients: { name: string } | null;
};

export type FileMeta = {
  client_id: string | null;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  mime_type: string;
  category?: string;
  note?: string | null;
};

function toRow(r: Record<string, unknown>): FileRow {
  const { client_name, ...rest } = r as Record<string, unknown> & { client_name: string | null };
  const row = rest as unknown as Omit<FileRow, "uploaded_at" | "clients"> & { uploaded_at: unknown };
  const uploaded = row.uploaded_at as unknown;
  return {
    ...(row as unknown as FileRow),
    size_bytes: num((row as unknown as FileRow).size_bytes),
    uploaded_at: uploaded instanceof Date ? uploaded.toISOString() : String(uploaded ?? ""),
    clients: client_name ? { name: client_name } : null,
  };
}

export async function listFiles(): Promise<FileRow[]> {
  await requireUser();
  const rows = await sql`select f.*, c.name as client_name from files f
    left join clients c on c.id = f.client_id
    where f.client_id is null order by f.uploaded_at desc`;
  return rows.map(toRow);
}

export async function listClientFiles(clientId: string): Promise<FileRow[]> {
  await requireUser();
  const rows = await sql`select f.*, c.name as client_name from files f
    left join clients c on c.id = f.client_id
    where f.client_id=${clientId} order by f.uploaded_at desc`;
  return rows.map(toRow);
}

export async function recordFile(meta: FileMeta): Promise<void> {
  const user = await requireUser();
  const note = meta.note?.trim() ? meta.note.trim() : null;
  await sql`insert into files (client_id, storage_path, file_name, size_bytes, mime_type, category, note, uploaded_by)
    values (${meta.client_id}, ${meta.storage_path}, ${meta.file_name}, ${meta.size_bytes}, ${meta.mime_type}, ${meta.category ?? null}, ${note}, ${user.email})`;
}

export async function updateFileNote(id: string, note: string): Promise<void> {
  await requireUser();
  await sql`update files set note=${note.trim() || null} where id=${id}`;
}

export async function deleteFileRecord(id: string): Promise<void> {
  await requireUser();
  await sql`delete from files where id=${id}`;
}

export type ReportFileKind = "report" | "document" | "slip" | "qr";

export type MonthlyReportFileRow = {
  id: string;
  kind: ReportFileKind;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
  uploaded_by: string | null;
  client_id: string | null;
  client_name: string | null;
  report_id: string | null;
  period_label: string | null;
  seq: number | null;
  label: string | null;
  status: string | null;
  report_no: string | null;
  form_code: string | null;
  amount: number | null;
};

/**
 * Every file that belongs to a monthly report: the archived report PDFs,
 * the Part 2 documents, and the pay-in slips / QR images attached to filings.
 * Joined to the round + client so the files page can filter and label them.
 */
export async function listMonthlyReportFiles(): Promise<MonthlyReportFileRow[]> {
  await requireUser();
  const rows = (await sql`
    select f.id::text as id, 'report' as kind, f.storage_path, f.file_name,
      f.size_bytes, f.mime_type, f.uploaded_at as created_at, f.uploaded_by,
      f.client_id::text as client_id, c.name as client_name,
      r.id::text as report_id, r.period_label, r.seq, r.label, r.status, r.report_no,
      null::text as form_code, null::numeric as amount
    from files f
    left join monthly_reports r on r.id = f.report_id
    left join clients c on c.id = f.client_id
    where f.category = 'monthly-report'

    union all

    select d.id::text as id, 'document' as kind, d.storage_path, d.file_name,
      d.size_bytes, d.mime_type, d.created_at, null::text as uploaded_by,
      r.client_id::text as client_id, c.name as client_name,
      r.id::text as report_id, r.period_label, r.seq, r.label, r.status, r.report_no,
      null::text as form_code, null::numeric as amount
    from report_documents d
    join monthly_reports r on r.id = d.report_id
    left join clients c on c.id = r.client_id

    union all

    select a.id::text as id,
      case
        when a.kind = 'qr' then 'qr'
        when a.kind = 'document' then 'document'
        else 'slip'
      end as kind,
      a.storage_path, a.file_name, a.size_bytes, a.mime_type, a.created_at,
      null::text as uploaded_by,
      r.client_id::text as client_id, c.name as client_name,
      r.id::text as report_id, r.period_label, r.seq, r.label, r.status, r.report_no,
      mf.form_code, mf.amount
    from filing_attachments a
    join monthly_filings mf on mf.id = a.filing_id
    join monthly_reports r on r.id = mf.report_id
    left join clients c on c.id = r.client_id

    order by created_at desc
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind) as ReportFileKind,
    storage_path: String(r.storage_path),
    file_name: String(r.file_name),
    size_bytes: num(r.size_bytes),
    mime_type: r.mime_type == null ? null : String(r.mime_type),
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at ?? ""),
    uploaded_by: r.uploaded_by == null ? null : String(r.uploaded_by),
    client_id: r.client_id == null ? null : String(r.client_id),
    client_name: r.client_name == null ? null : String(r.client_name),
    report_id: r.report_id == null ? null : String(r.report_id),
    period_label: r.period_label == null ? null : String(r.period_label),
    seq: r.seq == null ? null : num(r.seq),
    label: r.label == null ? null : String(r.label),
    status: r.status == null ? null : String(r.status),
    report_no: r.report_no == null ? null : String(r.report_no),
    form_code: r.form_code == null ? null : String(r.form_code),
    amount: r.amount == null ? null : num(r.amount),
  }));
}

