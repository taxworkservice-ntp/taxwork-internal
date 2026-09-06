"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type ClientNoteType = "general" | "call" | "meeting" | "follow_up";

export type ClientNote = {
  id: string;
  client_id: string;
  title: string;
  body: string;
  note_type: ClientNoteType;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type ClientNoteForm = {
  title: string;
  body: string;
  note_type: ClientNoteType;
  tags: string;
  pinned: boolean;
};

export type ClientNoteClient = {
  id: string;
  name: string;
};

function str(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

function cleanTags(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeNote(row: ClientNote): ClientNote {
  return {
    ...row,
    tags: row.tags ?? [],
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export async function getClientForNotes(clientId: string): Promise<ClientNoteClient | null> {
  await requireUser();
  const rows = (await sql`select id, name from clients where id=${clientId}`) as ClientNoteClient[];
  return rows[0] ?? null;
}

export async function listClientNotes(clientId: string): Promise<ClientNote[]> {
  await requireUser();
  const rows = (await sql`
    select *
    from client_notes
    where client_id=${clientId}
    order by pinned desc, updated_at desc
  `) as ClientNote[];
  return rows.map(normalizeNote);
}

export async function createClientNote(clientId: string, form: ClientNoteForm): Promise<string> {
  await requireUser();
  const rows = (await sql`
    insert into client_notes (client_id, title, body, note_type, tags, pinned)
    values (${clientId}, ${form.title}, ${form.body}, ${form.note_type}, ${cleanTags(form.tags)}, ${form.pinned})
    returning id
  `) as { id: string }[];
  return rows[0].id;
}

export async function updateClientNote(noteId: string, form: ClientNoteForm): Promise<void> {
  await requireUser();
  await sql`
    update client_notes
    set title=${form.title},
        body=${form.body},
        note_type=${form.note_type},
        tags=${cleanTags(form.tags)},
        pinned=${form.pinned},
        updated_at=now()
    where id=${noteId}
  `;
}

export async function deleteClientNote(noteId: string): Promise<void> {
  await requireUser();
  await sql`delete from client_notes where id=${noteId}`;
}
