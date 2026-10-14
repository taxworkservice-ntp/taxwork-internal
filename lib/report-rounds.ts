/**
 * Pure helpers for the monthly-report round model. Kept out of the
 * `"use server"` action file so they can be imported (and unit-tested) without
 * pulling in the server runtime.
 */

export type RoundMirrorTarget = { id: string; seq: number; filingCount: number };

export type RoundMirrorStep =
  | { action: "create"; seq: number; sourceId: string }
  | { action: "fill"; seq: number; sourceId: string; targetId: string };

/**
 * Decide how to mirror a previous month's rounds onto the current month.
 *
 * - A source round with no counterpart yet → create it (then carry its items).
 * - A source round whose counterpart exists but is empty → fill it.
 * - A source round whose counterpart already has items → leave it untouched.
 */
export function planRoundMirror(
  source: { id: string; seq: number }[],
  targets: RoundMirrorTarget[]
): RoundMirrorStep[] {
  const bySeq = new Map<number, RoundMirrorTarget>();
  for (const target of targets) bySeq.set(target.seq, target);
  const steps: RoundMirrorStep[] = [];
  const seen = new Set<number>();
  for (const s of [...source].sort((a, b) => a.seq - b.seq)) {
    if (seen.has(s.seq)) continue;
    seen.add(s.seq);
    const target = bySeq.get(s.seq);
    if (!target) {
      steps.push({ action: "create", seq: s.seq, sourceId: s.id });
    } else if (target.filingCount === 0) {
      steps.push({ action: "fill", seq: s.seq, sourceId: s.id, targetId: target.id });
    }
  }
  return steps;
}
