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
