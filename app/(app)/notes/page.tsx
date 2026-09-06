"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  listRecentClientNotes,
  type ClientNoteListItem,
  type ClientNoteType,
} from "@/lib/actions/client-notes";

const NOTE_TYPE_LABELS: Record<ClientNoteType, string> = {
  general: "ทั่วไป",
  call: "โทร",
  meeting: "ประชุม",
  follow_up: "ติดตาม",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function preview(note: ClientNoteListItem) {
  return note.body.trim() || note.title.trim() || "ไม่มีรายละเอียด";
}

export default function NotesPage() {
  const [notes, setNotes] = useState<ClientNoteListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRecentClientNotes()
      .then(setNotes)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => {
      const haystack = [
        note.title,
        note.body,
        note.client_name,
        NOTE_TYPE_LABELS[note.note_type],
        ...note.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [notes, search]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-200 bg-[#fafafa]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <h1 className="text-lg font-semibold">โน้ต</h1>
        <p className="mt-1 text-sm text-neutral-500">โน้ตล่าสุดจากทุกลูกค้า</p>
        <input
          className="input mt-3"
          placeholder="ค้นหาโน้ตหรือลูกค้า..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2 py-4">
        {loading && <p className="text-sm text-neutral-500">กำลังโหลด...</p>}

        {!loading &&
          filtered.map((note) => (
            <Link
              key={note.id}
              href={`/clients/${note.client_id}/notes`}
              className="block rounded border border-neutral-200 bg-white p-3 active:bg-neutral-50"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-medium">
                    {note.pinned ? "★ " : ""}
                    {note.title || preview(note)}
                  </h2>
                  <p className="truncate text-xs text-neutral-500">{note.client_name}</p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">{formatDate(note.updated_at)}</span>
              </div>
              <p className="line-clamp-2 text-sm leading-6 text-neutral-600">{preview(note)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {NOTE_TYPE_LABELS[note.note_type]}
                </span>
                {note.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}

        {!loading && !filtered.length && (
          <div className="rounded border border-dashed border-neutral-300 bg-white p-6 text-center">
            <p className="text-sm font-medium">ยังไม่มีโน้ต</p>
            <p className="mt-1 text-sm text-neutral-500">เข้าไปที่หน้าลูกค้าเพื่อเพิ่มโน้ตแรก</p>
            <Link className="btn-primary mt-4" href="/clients">
              เลือกลูกค้า
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
