"use client";

import { useState } from "react";

type State = "idle" | "sending" | "sent" | "deduped" | "error";

/**
 * Client-facing "email me this report" action (archival copy). Sends only to the
 * client's email on file — the server enforces the recipient. The address is
 * shown so the client can confirm which inbox will receive the archive.
 */
export default function ShareEmailButton({
  emailUrl,
  email,
}: {
  emailUrl: string;
  email: string | null;
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
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-900 shadow-sm transition-colors hover:bg-blue-100 active:bg-blue-100 disabled:opacity-60"
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
        {state === "sending"
          ? "กำลังส่ง..."
          : done
            ? "ส่งอีกครั้ง"
            : "ส่งไปที่อีเมลของท่านเพื่อจัดเก็บ"}
      </button>

      <p className="text-center text-xs text-neutral-500">
        {done && state === "sent" && (
          <span className="font-medium text-emerald-600 break-all">
            ส่งแล้ว — ตรวจสอบอีเมล{email ? ` ${email}` : "ของท่าน"}
          </span>
        )}
        {done && state === "deduped" && (
          <span className="font-medium text-emerald-600 break-all">
            ส่งไปแล้วเมื่อสักครู่ — ตรวจสอบอีเมล
            {email ? ` ${email}` : "ของท่าน"}
          </span>
        )}
        {state === "error" && <span className="text-red-600">{error}</span>}
        {(state === "idle" || state === "sending") && (
          <>
            ระบบจะส่งรายงานฉบับเต็มไปที่อีเมลที่ลงทะเบียนไว้ของท่าน
            {email && (
              <span className="mt-0.5 block break-all font-mono text-xs text-neutral-700">
                {email}
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
