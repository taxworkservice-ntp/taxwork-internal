"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type EntityKind = "client" | "contact";

export type EntityItem = {
  /** Stable selection key, e.g. "client:<uuid>" or "contact:<uuid>". */
  key: string;
  /** Raw database id (for the shared favorites store). */
  rawId: string;
  kind: EntityKind;
  name: string;
  /** Secondary line, e.g. firm + type for contacts. */
  detail: string | null;
  taxId: string | null;
};

const KIND_LABEL: Record<EntityKind, string> = {
  client: "ลูกค้า",
  contact: "ผู้เกี่ยวข้อง",
};

type EntityPickerProps = {
  /** Base id for the search input (label htmlFor). */
  id: string;
  /** Box title shown above the search field. */
  title: string;
  /** Meta text in the title, e.g. loading state or item count. */
  meta: string;
  placeholder: string;
  items: EntityItem[];
  loading: boolean;
  favorites: string[];
  onToggleFav: (rawId: string) => void;
  /** Selection key of the currently picked item ("" = manual). */
  selectedKey: string;
  onPick: (item: EntityItem) => void;
  /** Clear the pick (typed values are kept). */
  onClearSelection: () => void;
  /** Increment to reset the search box (form reset). */
  resetKey: number;
  emptyText: string;
  footText: string;
};

/**
 * Search-as-you-type picker over clients/contacts database records.
 * Favorites first, Thai-sorted, keyboard navigable. Picking fills the
 * caller's form; everything stays editable afterwards.
 */
export default function EntityPicker({
  id,
  title,
  meta,
  placeholder,
  items,
  loading,
  favorites,
  onToggleFav,
  selectedKey,
  onPick,
  onClearSelection,
  resetKey,
  emptyText,
  footText,
}: EntityPickerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  useEffect(() => {
    setQuery("");
    setOpen(false);
    setHi(0);
  }, [resetKey]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = query.replace(/\D/g, "");
    const pool = q
      ? items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            (it.detail ?? "").toLowerCase().includes(q) ||
            (qDigits && (it.taxId ?? "").replace(/\D/g, "").includes(qDigits))
        )
      : items;
    const favIds = new Set(favorites);
    const favs = pool
      .filter((it) => favIds.has(it.rawId))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
    const rest = pool
      .filter((it) => !favIds.has(it.rawId))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
    return [...favs, ...rest];
  }, [items, query, favorites]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open ]);

  // Keep the keyboard-highlighted row visible while scrolling the list.
  useEffect(() => {
    if (!open) return;
    rowRefs.current[hi]?.scrollIntoView({ block: "nearest" });
  }, [hi, open ]);

  const selectedRawId = selectedKey.includes(":")
    ? selectedKey.slice(selectedKey.indexOf(":") + 1)
    : selectedKey;

  return (
    <div className="mb-3 rounded border border-neutral-200 bg-neutral-50 p-3">
      <label className="label" htmlFor={id}>
        {title} {meta}
      </label>
      <div ref={boxRef} className="relative">
        <div className="flex items-center gap-2">
          <input
            id={id}
            className="input flex-1"
            placeholder={placeholder}
            autoComplete="off"
            disabled={loading}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Typing after a pick switches back to manual editing.
              if (selectedKey) onClearSelection();
              setOpen(true);
              setHi(0);
            }}
            onFocus={() => {
              setOpen(true);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && suggestions.length) {
                e.preventDefault();
                setHi((h) => (h + 1) % suggestions.length);
              } else if (e.key === "ArrowUp" && suggestions.length) {
                e.preventDefault();
                setHi((h) => (h - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "Enter" && open && suggestions[hi]) {
                e.preventDefault();
                onPick(suggestions[hi]);
                setOpen(false);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {selectedKey ? (
            <>
              <button
                type="button"
                className="btn shrink-0 !px-2"
                title={
                  favorites.includes(selectedRawId)
                    ? "เอาออกจากรายการโปรด"
                    : "เพิ่มในรายการโปรด"
                }
                onClick={() => onToggleFav(selectedRawId)}
              >
                {favorites.includes(selectedRawId) ? "★" : "☆"}
              </button>
              <button
                type="button"
                className="btn shrink-0 !px-2"
                title="ล้างที่เลือก (คงค่าที่กรอกไว้)"
                onClick={() => {
                  onClearSelection();
                  setQuery("");
                  setOpen(false);
                }}
              >
                ✕
              </button>
            </>
          ) : (
            query && (
              <button
                type="button"
                className="btn shrink-0 !px-2"
                title="ล้างคำค้น"
                onClick={() => {
                  setQuery("");
                  setOpen(true);
                }}
              >
                ✕
              </button>
            )
          )}
        </div>
        {open && !loading && (
          <div
            className="absolute inset-x-0 top-full z-10 mt-1 overflow-y-auto overscroll-contain rounded border border-neutral-200 bg-white shadow-lg"
            style={{
              // Inline (not Tailwind) so the cap always applies, even if the
              // production CSS was built before this class existed.
              maxHeight: "min(320px, 50vh)",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
            }}
          >
            {suggestions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-neutral-500">{emptyText}</div>
            ) : (
              suggestions.map((it, i) => (
                <button
                  key={it.key}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                    i === hi ? "bg-neutral-100" : ""
                  }`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => {
                    onPick(it);
                    setOpen(false);
                  }}
                >
                  <span className="w-4 shrink-0 text-amber-500">
                    {favorites.includes(it.rawId) ? "★" : ""}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      it.kind === "client"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {KIND_LABEL[it.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.name}</span>
                    {it.detail && (
                      <span className="block truncate text-xs text-neutral-400">
                        {it.detail}
                      </span>
                    )}
                  </span>
                  {it.taxId && (
                    <span className="shrink-0 font-mono text-xs text-neutral-400">
                      {it.taxId}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-500">{footText}</p>
    </div>
  );
}
