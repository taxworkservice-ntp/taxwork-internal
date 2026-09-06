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
  type ClientNoteType,
} from "@/lib/actions/client-notes";

const emptyForm: ClientNoteForm = {
  title: "",
  body: "",
  note_type: "general",
  tags: "",
  pinned: false,
};

const NOTE_TYPES: { value: ClientNoteType; label: string }[] = [
  { value: "general", label: "ทั่วไป" },
  { value: "call", label: "โทร" },
  { value: "meeting", label: "ประชุม" },
  { value: "follow_up", label: "ติดตาม" },
];

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

function formFromNote(note: ClientNote): ClientNoteForm {
  return {
    title: note.title,
    body: note.body,
    note_type: note.note_type,
    tags: note.tags.join(", "),
    pinned: note.pinned,
  };
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

  const load = useCallback(async () => {
    const [clientData, noteData] = await Promise.all([
      getClientForNotes(id),
      listClientNotes(id),
    ]);
    setClient(clientData);
    setNotes(noteData);
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateClientNote(editingId, form);
      } else {
        await createClientNote(id, form);
      }
      setIsEditing(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId || !confirm("ลบโน้ตนี้ใช่หรือไม่?")) return;
    await deleteClientNote(editingId);
    setIsEditing(false);
    setEditingId(null);
    setForm(emptyForm);
    load();
  }

  if (!client) return <p className="text-sm text-neutral-500">กำลังโหลด...</p>;

  if (isEditing) {
    return (
      <form onSubmit={save} className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-xl flex-col">
        <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-200 bg-[#fafafa]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="btn" onClick={() => setIsEditing(false)}>
              กลับ
            </button>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-medium">{client.name}</p>
              <p className="text-xs text-neutral-500">{editingId ? "แก้ไขโน้ต" : "โน้ตใหม่"}</p>
            </div>
            <button className="btn-primary" disabled={saving}>
              {saving ? "กำลังบันทึก" : "บันทึก"}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 py-4">
          <input
            className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-neutral-400"
            placeholder="หัวข้อ"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <div className="flex gap-2 overflow-x-auto pb-1">
            {NOTE_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                  form.note_type === type.value
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-neutral-200 bg-white text-neutral-600"
                }`}
                onClick={() => setForm({ ...form, note_type: type.value })}
              >
                {type.label}
              </button>
            ))}
          </div>

          <textarea
            className="min-h-[45vh] flex-1 resize-none rounded border border-neutral-200 bg-white px-3 py-3 text-base leading-7 outline-none focus:border-blue-500"
            placeholder="พิมพ์โน้ตระหว่างคุยกับลูกค้า..."
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />

          <input
            className="input"
            placeholder="แท็ก เช่น ภาษี, เอกสาร, เงินเดือน"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
          />

          <label className="flex items-center justify-between rounded border border-neutral-200 bg-white px-3 py-2 text-sm">
            <span>ปักหมุดโน้ตสำคัญ</span>
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            />
          </label>

          {editingId && (
            <button type="button" className="btn-danger w-fit" onClick={remove}>
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
            เพิ่ม
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
        {filtered.map((note) => {
          const type = NOTE_TYPES.find((item) => item.value === note.note_type)?.label ?? "ทั่วไป";
          return (
            <button
              key={note.id}
              className="w-full rounded border border-neutral-200 bg-white p-3 text-left active:bg-neutral-50"
              onClick={() => startEdit(note)}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
                  {note.pinned ? "★ " : ""}
                  {note.title || preview(note)}
                </h2>
                <span className="shrink-0 text-xs text-neutral-400">{formatDate(note.updated_at)}</span>
              </div>
              <p className="line-clamp-2 text-sm leading-6 text-neutral-600">{preview(note)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{type}</span>
                {note.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          );
        })}

        {!filtered.length && (
          <div className="rounded border border-dashed border-neutral-300 bg-white p-6 text-center">
            <p className="text-sm font-medium">ยังไม่มีโน้ต</p>
            <p className="mt-1 text-sm text-neutral-500">แตะเพิ่มเพื่อจดระหว่างคุยกับลูกค้า</p>
            <button className="btn-primary mt-4" onClick={startNew}>
              เพิ่มโน้ต
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
