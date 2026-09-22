export default function InlineConfirm({
  message,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  busy = false,
  onConfirm,
  onCancel,
  className = "",
}: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-xs text-red-600">{message}</span>
      <button type="button" className="btn-danger px-2 py-1 text-xs" disabled={busy} onClick={onConfirm}>
        {busy ? "กำลัง..." : confirmLabel}
      </button>
      <button type="button" className="btn px-2 py-1 text-xs" disabled={busy} onClick={onCancel}>
        {cancelLabel}
      </button>
    </span>
  );
}
