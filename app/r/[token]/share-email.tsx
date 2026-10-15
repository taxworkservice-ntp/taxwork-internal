"use client";

import { useState } from "react";

type State = "idle" | "sending" | "sent" | "deduped" | "error";

/**
 * Client-facing "email me this report" action. Sends only to the client's email
 * on file (masked in the UI); the server enforces the recipient. Deduped and
 * rate-limited server-side.
 */
export default function ShareEmailButton({
  emailUrl,
  maskedEmail,
}: {
  emailUrl: string;
  maskedEmail: string;
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch(emailUrl, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        deduped?: boolean;
      };
      if (!res.ok) {
        setState("error");
        setError(data.error || "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setState(data.deduped ? "deduped" : "sent");
    } catch {
      setState("error");
      setError("ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่");
    }
  }

  const done = state === "sent" || state === "deduped";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={send}
        disabled={state === "sending"}
        aria-busy={state === "sending"}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-semibold text-neutral-800 shadow-sm transition-colors active:bg-neutral-100 disabled:opacity-60"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path
            d="M2 4h12v8H2zM2 4l6 4.5L14 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {state === "sending" ? "กำลังส่ง..." : done ? "ส่งอีกครั้ง" : "ส่งไปที่อีเมลของฉัน"}
      </button>

      <p className="text-center text-xs text-neutral-500">
        {done && state === "sent" && (
          <span className="font-medium text-emerald-600">
            ส่งแล้ว — ตรวจสอบอีเมลของท่าน
          </span>
        )}
        {done && state === "deduped" && (
          <span className="font-medium text-emerald-600">
            ส่งไปแล้วเมื่อสักครู่ — ตรวจสอบอีเมลของท่าน
          </span>
        )}
        {state === "error" && <span className="text-red-600">{error}</span>}
        {(state === "idle" || state === "sending") && (
          <>
            ส่งไปที่ <span className="font-mono">{maskedEmail}</span>
          </>
        )}
        {done && (
          <span className="block text-neutral-400">
            หรือส่งไปที่ <span className="font-mono">{maskedEmail}</span>
          </span>
        )}
      </p>
    </div>
  );
}
