"use client";

import { useState } from "react";

export default function PasswordValue({ value }: { value: string | null }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-neutral-400">—</span>;
  const text = value;

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs">{show ? text : "••••••••"}</span>
      <button
        type="button"
        aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        className="text-neutral-400 hover:text-neutral-700"
        onClick={() => setShow((v) => !v)}
      >
        {show ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" strokeLinecap="round" />
            <path d="M9.4 5.3A9.6 9.6 0 0 1 12 5c5 0 8.5 4.6 9.4 6a1 1 0 0 1 0 1.2 12.6 12.6 0 0 1-2.4 3M6.1 6.1A12.8 12.8 0 0 0 2.6 11a1 1 0 0 0 0 1.2C3.5 13.5 7 17 12 17a9.4 9.4 0 0 0 3.5-.7" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2.6 11a1 1 0 0 1 0 1.2C3.5 13.5 7 17 12 17s8.5-3.5 9.4-4.8a1 1 0 0 0 0-1.2C20.5 9.5 17 6 12 6S3.5 9.5 2.6 11z" />
            <circle cx="12" cy="11.5" r="2.5" />
          </svg>
        )}
      </button>
      <button type="button" className="text-xs text-blue-600 underline" onClick={copy}>
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
    </span>
  );
}
