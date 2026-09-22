"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ClientAvatar from "@/components/client-avatar";
import { useClientFavorites } from "@/lib/use-client-favorites";

export type ClientSelectOption = {
  id: string;
  name: string;
  tax_id?: string | null;
  avatar_text?: string | null;
  avatar_color?: string | null;
};

/**
 * Single-value client picker with type-to-search. Favourites (shared with the
 * Clients page via localStorage) are pinned to the top, can be toggled inline
 * with ★, and can be isolated with the "only favourites" filter.
 */
export default function ClientSelect({
  clients,
  value,
  onChange,
  placeholder = "เลือกหรือค้นหาลูกค้า...",
  disabled = false,
  className = "",
}: {
  clients: ClientSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { favorites, toggleFav, onlyFav, setOnlyFav } = useClientFavorites();

  const selected = clients.find((c) => c.id === value) ?? null;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => {
        if (onlyFav && !favorites.includes(c.id)) return false;
        if (!q) return true;
        return [c.name, c.tax_id].some((v) => (v ?? "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const fa = favorites.includes(a.id) ? 0 : 1;
        const fb = favorites.includes(b.id) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return a.name.localeCompare(b.name, "th");
      });
  }, [clients, query, onlyFav, favorites]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function close() {
    setOpen(false);
    setQuery("");
    setHighlight(-1);
  }

  function commit(id: string) {
    onChange(id);
    close();
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setHighlight(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const choice =
        highlight >= 0 && highlight < items.length ? items[highlight] : items[0];
      if (choice) commit(choice.id);
      return;
    }
    setHighlight(-1);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {selected && (
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
          <ClientAvatar
            name={selected.name}
            text={selected.avatar_text}
            color={selected.avatar_color}
            size="xs"
          />
        </span>
      )}
      <input
        className={`input ${selected ? "pl-9" : ""} ${value ? "pr-14" : ""}`}
        value={open ? query : selected?.name ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={openMenu}
        onClick={openMenu}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {value && !disabled && (
        <button
          type="button"
          aria-label="ล้างลูกค้าที่เลือก"
          className="absolute top-1/2 right-7 -translate-y-1/2 text-lg leading-none text-neutral-400 hover:text-neutral-600"
          onMouseDown={(e) => {
            e.preventDefault();
            commit("");
          }}
        >
          ×
        </button>
      )}
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-neutral-400">
        ▾
      </span>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-neutral-200 bg-white shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 border-b border-neutral-100 px-3 py-2 text-left text-xs text-neutral-600 hover:bg-neutral-50"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOnlyFav((v) => !v);
              setHighlight(-1);
            }}
          >
            <span className={onlyFav ? "text-yellow-500" : "text-neutral-300"}>★</span>
            เฉพาะรายการโปรด
            {favorites.length > 0 && (
              <span className="text-neutral-400">({favorites.length})</span>
            )}
          </button>
          <ul id={listId} role="listbox" className="max-h-56 overflow-auto py-1 text-sm">
            {items.map((c, i) => {
              const fav = favorites.includes(c.id);
              const active = c.id === value;
              return (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={active}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${
                    i === highlight ? "bg-blue-50" : "hover:bg-neutral-100"
                  } ${active ? "font-medium text-neutral-900" : "text-neutral-700"}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(c.id);
                  }}
                >
                  <button
                    type="button"
                    aria-label={fav ? "เอาออกจากรายการโปรด" : "ติดดาวเป็นรายการโปรด"}
                    title={fav ? "เอาออกจากรายการโปรด" : "ติดดาวเป็นรายการโปรด"}
                    className={`shrink-0 text-base leading-none ${
                      fav ? "text-yellow-500" : "text-neutral-300 hover:text-yellow-500"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFav(c.id);
                    }}
                  >
                    ★
                  </button>
                  <ClientAvatar
                    name={c.name}
                    text={c.avatar_text}
                    color={c.avatar_color}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.tax_id && (
                    <span className="shrink-0 text-xs text-neutral-400">{c.tax_id}</span>
                  )}
                </li>
              );
            })}
            {!items.length && (
              <li className="px-3 py-2 text-neutral-400">
                {onlyFav ? "ยังไม่มีลูกค้าในรายการโปรด" : "ไม่พบลูกค้า"}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
