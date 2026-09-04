// Shared helpers for Server Actions (server-only).

/** Coerce Postgres numeric/bigint (may arrive as string over HTTP) to number. */
export function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Build a parameterized UPDATE for an allowlisted column set. */
export function buildUpdate(
  table: string,
  id: string,
  patch: Record<string, unknown>,
  allowed: string[]
): { text: string; params: unknown[] } {
  const cols = allowed.filter((c) => c in patch);
  if (cols.length === 0) throw new Error("Nothing to update");
  const params: unknown[] = [];
  const set = cols
    .map((c) => {
      params.push(patch[c] ?? null);
      return `"${c}"=$${params.length}`;
    })
    .join(",");
  params.push(id);
  return { text: `update "${table}" set ${set} where id=$${params.length}`, params };
}
