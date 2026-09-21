"use client";

import { useCallback, useState } from "react";

export type ToastType = "success" | "error" | "info";

export type ToastAction = { label: string; onClick: () => void };

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
  duration?: number;
};

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      const duration = toast.duration ?? 4000;
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}

const TONE: Record<ToastType, { ring: string; icon: string; dot: string }> = {
  success: { ring: "border-emerald-200", icon: "text-emerald-600", dot: "bg-emerald-500" },
  error: { ring: "border-red-200", icon: "text-red-600", dot: "bg-red-500" },
  info: { ring: "border-neutral-200", icon: "text-blue-600", dot: "bg-blue-500" },
};

function Icon({ type }: { type: ToastType }) {
  if (type === "success")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 8.5L6.5 12L13 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (type === "error")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.5v4M8 5h.01" strokeLinecap="round" />
    </svg>
  );
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const tone = TONE[t.type];
        return (
          <div
            key={t.id}
            role="status"
            className={`animate-toast-in pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg ${tone.ring}`}
          >
            <span className={`mt-0.5 shrink-0 ${tone.icon}`}>
              <Icon type={t.type} />
            </span>
            <p className="flex-1 break-words text-neutral-800">{t.message}</p>
            {t.action && (
              <button
                type="button"
                className="shrink-0 font-medium text-blue-600 hover:underline"
                onClick={() => {
                  t.action?.onClick();
                  onDismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="ปิดการแจ้งเตือน"
              className="-mt-1 shrink-0 text-lg leading-none text-neutral-400 hover:text-neutral-600"
              onClick={() => onDismiss(t.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
