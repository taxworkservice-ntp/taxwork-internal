import { contrastText, normalizeHex, resolveInitials } from "@/lib/client-avatar";

const SIZE = {
  xs: "h-5 w-5 text-[9px] rounded",
  sm: "h-6 w-6 text-[10px] rounded-md",
  md: "h-8 w-8 text-xs rounded-md",
  lg: "h-12 w-12 text-lg rounded-lg",
} as const;

/**
 * Rounded-square monogram shown in front of a client's name. Uses the
 * configured abbreviation + colour, falling back to name-derived initials and
 * a neutral (dull) tone when unset.
 */
export default function ClientAvatar({
  name,
  text,
  color,
  size = "sm",
  className = "",
}: {
  name: string;
  text?: string | null;
  color?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const letters = resolveInitials(name, text);
  const hex = normalizeHex(color);
  const style = hex ? { backgroundColor: hex, color: contrastText(hex) } : undefined;
  const tone = hex
    ? ""
    : "bg-neutral-100 text-neutral-400 ring-1 ring-neutral-200 ring-inset";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-semibold leading-none uppercase select-none ${SIZE[size]} ${tone} ${className}`}
      style={style}
      title={name}
      aria-hidden="true"
    >
      {letters || "•"}
    </span>
  );
}
