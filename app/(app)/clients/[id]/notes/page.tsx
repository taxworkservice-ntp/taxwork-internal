"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  createClientNote,
  deleteClientNote,
  getClientForNotes,
  listClientNotes,
  updateClientNote,
  type ClientNote,
  type ClientNoteClient,
  type ClientNoteForm,
} from "@/lib/actions/client-notes";

const emptyForm: ClientNoteForm = {
  title: "",
  body: "- ",
  note_type: "general",
  tags: "",
  pinned: false,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function preview(note: ClientNote) {
  return note.body.trim() || note.title.trim() || "ไม่มีรายละเอียด";
}

function headline(note: ClientNote) {
  const first = (note.title.trim() || preview(note).split("\n")[0] || "").replace(/^[-•*]\s*/, "");
  return first.slice(0, 80);
}

function formFromNote(note: ClientNote): ClientNoteForm {
  // Preserve legacy metadata (title/tags/pinned/type) — the simplified UI
  // only edits body, so keep the rest intact on save.
  return {
    title: note.title,
    body: note.body,
    note_type: note.note_type,
    tags: note.tags.join(", "),
    pinned: note.pinned,
  };
}

function cleanBullets(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^([\-•*]+)\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

export default function ClientNotesPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientNoteClient | null>(null);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientNoteForm>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const clientData = await getClientForNotes(id);
      setClient(clientData);

      try {
        setNotes(await listClientNotes(id));
      } catch {
        setNotes([]);
        setError("ยังโหลดโน้ตไม่ได้ กรุณาตรวจสอบว่า database migration ถูก apply แล้ว");
      }
    } catch {
      setError("โหลดข้อมูลลูกค้าไม่ได้");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => {
      const haystack = [note.title, note.body, note.note_type, ...note.tags].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [notes, search]);

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setIsEditing(true);
  }

  function startEdit(note: ClientNote) {
    setEditingId(note.id);
    setForm(formFromNote(note));
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  const canSave = Boolean(cleanBullets(form.body) && !saving);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleanBody = cleanBullets(form.body);
    if (!cleanBody || saving) return;
    setSaving(true);
    setError("");
    try {
      const nextForm: ClientNoteForm = editingId
        ? { ...form, body: cleanBody }
        : {
            title: "",
            body: cleanBody,
            note_type: "general" as const,
            tags: "",
            pinned: false,
          };
      if (editingId) {
        await updateClientNote(editingId, nextForm);
      } else {
        await createClientNote(id, nextForm);
      }
      cancelEdit();
      await load();
    } catch {
      setError("บันทึกโน้ตไม่ได้ กรุณาตรวจสอบ database migration");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId || !confirm("ลบโน้ตนี้ใช่หรือไม่?")) return;
    setSaving(true);
    try {
      await deleteClientNote(editingId);
      cancelEdit();
      await load();
    } catch {
      setError("ลบโน้ตไม่ได้ กรุณาลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">กำลังโหลด...</p>;
  if (!client) return <p className="text-sm text-neutral-500">{error || "ไม่พบลูกค้า"}</p>;

  if (isEditing) {
    return (
      <form onSubmit={save} className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-xl flex-col">
        <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-200 bg-[#fafafa]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="btn" onClick={cancelEdit}>
              กลับ
            </button>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-medium">{client.name}</p>
              <p className="text-xs text-neutral-500">{editingId ? "แก้ไขโน้ต" : "โน้ตใหม่"}</p>
            </div>
            <button className="btn-primary" disabled={!canSave}>
              {saving ? "กำลังบันทึก" : "บันทึก"}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 py-4">
          {error && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {error}
            </div>
          )}
          <textarea
            className="min-h-[60vh] flex-1 resize-none rounded border border-neutral-200 bg-white px-3 py-3 text-base leading-7 outline-none focus:border-blue-500"
            placeholder={"- โทรคุยเรื่องเอกสาร ภ.พ.30\n- ลูกค้าจะส่ง statement ภายในศุกร์นี้"}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />

          {editingId && (
            <button type="button" className="btn-danger w-fit" onClick={remove} disabled={saving}>
              ลบโน้ต
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-200 bg-[#fafafa]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link className="btn" href={`/clients/${id}`}>
            กลับ
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">โน้ต</h1>
            <p className="truncate text-xs text-neutral-500">{client.name}</p>
          </div>
          <button className="btn-primary" onClick={startNew}>
            เพิ่ม bullet
          </button>
        </div>
        <input
          className="input mt-3"
          placeholder="ค้นหาโน้ต..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2 py-4">
        {error && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {filtered.map((note) => (
            <button
              key={note.id}
              className="w-full rounded border border-neutral-200 bg-white p-3 text-left active:bg-neutral-50"
              onClick={() => startEdit(note)}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
                  {note.pinned ? "★ " : ""}{headline(note)}
                </h2>
                <span className="shrink-0 text-xs text-neutral-400">{formatDate(note.updated_at)}</span>
              </div>
              <p className="whitespace-pre-line text-sm leading-6 text-neutral-700">{preview(note)}</p>
            </button>
        ))}

        {!filtered.length && !notes.length && (
          <div className="rounded border border-dashed border-neutral-300 bg-white p-6 text-center">
            <p className="text-sm font-medium">ยังไม่มีโน้ต</p>
            <p className="mt-1 text-sm text-neutral-500">แตะเพิ่ม bullet เพื่อจดระหว่างคุยกับลูกค้า</p>
            <button className="btn-primary mt-4" onClick={startNew}>
              เพิ่ม bullet
            </button>
          </div>
        )}

        {!filtered.length && Boolean(notes.length) && (
          <div className="rounded border border-dashed border-neutral-300 bg-white p-6 text-center">
            <p className="text-sm font-medium">ไม่พบโน้ตที่ค้นหา</p>
            <p className="mt-1 text-sm text-neutral-500">ลองเปลี่ยนคำค้น</p>
          </div>
        )}
      </div>
    </div>
  );
}
