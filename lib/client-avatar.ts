/**
 * Client monogram helpers — pure and framework-free so they can run on the
 * server (actions) or the client (components) and be unit tested.
 *
 * Letters are Latin/English only: initials are taken from Latin words, and a
 * purely Thai name yields no letters so the avatar falls back to a neutral
 * placeholder until an abbreviation is configured.
 */

export type AvatarPaletteToken = { key: string; hex: string };

/** Curated, muted palette that keeps long client lists visually consistent. */
export const AVATAR_PALETTE: AvatarPaletteToken[] = [
  { key: "slate", hex: "#475569" },
  { key: "gray", hex: "#4b5563" },
  { key: "blue", hex: "#2563eb" },
  { key: "indigo", hex: "#4f46e5" },
  { key: "violet", hex: "#7c3aed" },
  { key: "teal", hex: "#0d9488" },
  { key: "emerald", hex: "#059669" },
  { key: "amber", hex: "#d97706" },
  { key: "orange", hex: "#ea580c" },
  { key: "rose", hex: "#e11d48" },
];

/** Corporate words dropped when deriving initials from a company name. */
const CORPORATE_WORDS = new Set([
  "บริษัท",
  "บจก",
  "บจ.",
  "บจก.",
  "หจก",
  "หจ.",
  "ห้างหุ้นส่วนจำกัด",
  "ห้างหุ้นส่วน",
  "จำกัด",
  "มหาชน",
  "จก",
  "company",
  "limited",
  "ltd",
  "ltd.",
  "co",
  "co.",
  "corp",
  "corp.",
  "inc",
  "inc.",
  "public",
  "holdings",
  "group",
  "and",
  "&",
]);

/** Split a company name into meaningful words, dropping corporate tokens. */
export function significantWords(name: string): string[] {
  return name
    .replace(/[()（）]/g, " ")
    .replace(/[.,·•/]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !CORPORATE_WORDS.has(w.toLowerCase()));
}

/** Up to 4 English letters/digits, uppercase, for a client abbreviation. */
export function normalizeInitials(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4);
}

/**
 * Best-effort English initials from a company name (used when no abbreviation
 * is set). Only Latin words contribute, so a purely Thai name yields "" and the
 * avatar shows its neutral placeholder.
 */
export function clientInitials(name: string): string {
  const words = significantWords(name).filter((w) => /[A-Za-z0-9]/.test(w));
  return words
    .slice(0, 3)
    .map((w) => (w.match(/[A-Za-z0-9]/)?.[0] ?? "").toUpperCase())
    .join("");
}

/** Normalize a hex colour to `#rrggbb`, or null when invalid. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  return null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Pick a readable foreground (near-black or white) for a background hex. */
export function contrastText(hex: string): string {
  const n = normalizeHex(hex) ?? "#475569";
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const lum = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return lum > 0.6 ? "#171717" : "#ffffff";
}

/** Resolve the letters to render: explicit abbreviation, else auto-derived. */
export function resolveInitials(
  name: string,
  abbreviation?: string | null
): string {
  return normalizeInitials(abbreviation) || clientInitials(name);
}
