import type { ReactNode } from "react";

export type BadgeTone = "success" | "neutral" | "danger" | "info";

const TONE: Record<BadgeTone, string> = {
  success: "bg-emerald-50 text-emerald-700",
  neutral: "bg-neutral-100 text-neutral-600",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
};

export default function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}
