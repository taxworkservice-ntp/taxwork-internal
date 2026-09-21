import type { ReactNode } from "react";

function DefaultIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

export default function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center text-neutral-500">
      <span className="text-neutral-300">{icon ?? <DefaultIcon />}</span>
      <p className="text-sm font-medium text-neutral-600">{title}</p>
      {hint && <p className="text-xs">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
