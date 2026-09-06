"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientNote, listRecentClientNotes, type ClientNoteListItem } from "@/lib/actions/client-notes";
import { listClients, type Client } from "@/lib/actions/clients";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function cleanBullets(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("-") ? line : `- ${line}`))
    .join("\n");
}

function preview(note: ClientNoteListItem) {
  return note.body.trim() || "ไม่มีรายละเอียด";
}

export default function NotesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [notes, setNotes] = useState<ClientNoteListItem[]>([]);
  const [clientId, setClientId] = useState("");
  const [body, setBody] = useState("- ");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const clientData = await listClients();
      setClients(clientData);
      setClientId((current) => current || clientData[0]?.id || "");

      try {
        setNotes(await listRecentClientNotes());
      } catch {
        setNotes([]);
        setError("ยังโหลดโน้ตไม่ได้ กรุณาตรวจสอบว่า database migration ถูก apply แล้ว");
      }
    } catch {
      setError("โหลดรายชื่อลูกค้าไม่ได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => client.name.toLowerCase().includes(q));
  }, [clients, search]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleanBody = cleanBullets(body);
    if (!clientId || !cleanBody) return;

    setSaving(true);
    try {
      await createClientNote(clientId, {
        title: "",
        body: cleanBody,
        note_type: "general",
        tags: "",
        pinned: false,
      });
      setBody("- ");
      setSearch("");
      await load();
    } catch {
      setError("บันทึกโน้ตไม่ได้ กรุณาตรวจสอบ database migration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <form onSubmit={save} className="sticky top-0 z-10 -mx-4 border-b border-neutral-200 bg-[#fafafa]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <h1 className="text-lg font-semibold">โน้ต</h1>
        <p className="mt-1 text-sm text-neutral-500">เลือกลูกค้า แล้วจดเป็น bullet point</p>

        <div className="mt-3 space-y-2">
          <input
            className="input"
            placeholder="ค้นหาลูกค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {filteredClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <textarea
            className="min-h-36 w-full resize-none rounded border border-neutral-300 bg-white px-3 py-3 text-base leading-7 outline-none focus:border-blue-500"
            placeholder={"- โทรคุยเรื่องเอกสาร ภ.พ.30\n- ลูกค้าจะส่ง statement ภายในศุกร์นี้"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="btn-primary w-full py-2" disabled={saving || !clientId}>
            {saving ? "กำลังบันทึก" : "บันทึกโน้ต"}
          </button>
        </div>
      </form>

      <div className="space-y-2 py-4">
        {loading && <p className="text-sm text-neutral-500">กำลังโหลด...</p>}

        {error && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {!loading &&
          notes.map((note) => (
            <Link
              key={note.id}
              href={`/clients/${note.client_id}/notes`}
              className="block rounded border border-neutral-200 bg-white p-3 active:bg-neutral-50"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{note.client_name}</p>
                <span className="shrink-0 text-xs text-neutral-400">{formatDate(note.updated_at)}</span>
              </div>
              <p className="whitespace-pre-line text-sm leading-6 text-neutral-700">{preview(note)}</p>
            </Link>
          ))}

        {!loading && !notes.length && (
          <div className="rounded border border-dashed border-neutral-300 bg-white p-6 text-center">
            <p className="text-sm font-medium">ยังไม่มีโน้ต</p>
            <p className="mt-1 text-sm text-neutral-500">เลือกชื่อลูกค้า แล้วจด bullet แรกได้เลย</p>
          </div>
        )}
      </div>
    </div>
  );
}
