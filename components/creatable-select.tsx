"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Single-value combobox: pick an existing option or type a brand-new value.
 * Options are supplied by the caller (e.g. notes already used on files).
 */
export default function CreatableSelect({
  value,
  onChange,
  options,
  placeholder = "เลือกหรือพิมพ์เพื่อสร้าง...",
  disabled = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(q)),
    [options, q]
  );

  const trimmed = query.trim();
  const canCreate =
    trimmed.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  const items = canCreate ? [...filtered, trimmed] : filtered;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setHighlight(-1);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
    setHighlight(-1);
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setHighlight(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      setHighlight(-1);
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
      const choice = highlight >= 0 && highlight < items.length ? items[highlight] : items[0];
      if (choice) commit(choice);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        className="input pr-14"
        value={open ? query : value}
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
          aria-label="ล้างค่า"
          className="absolute top-1/2 right-7 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
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
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-neutral-200 bg-white py-1 text-sm shadow-lg"
        >
          {items.map((item, i) => {
            const isCreate = canCreate && i === items.length - 1;
            return (
              <li
                key={isCreate ? "__create__" : item}
                role="option"
                aria-selected={i === highlight && !isCreate}
                className={`cursor-pointer px-3 py-1.5 ${
                  i === highlight ? "bg-blue-50" : "hover:bg-neutral-100"
                } ${isCreate ? "text-blue-600" : "text-neutral-700"}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(item);
                }}
              >
                {isCreate ? `+ สร้าง "${item}"` : item}
              </li>
            );
          })}
          {!items.length && (
            <li className="px-3 py-1.5 text-neutral-400">พิมพ์เพื่อสร้างใหม่</li>
          )}
        </ul>
      )}
    </div>
  );
}
