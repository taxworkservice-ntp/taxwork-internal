export type PaymentStatus = "unpaid" | "partial" | "paid";

/** Round to satang to avoid float drift in comparisons. */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Payment status / remaining balance for a report round. Kept pure so it can
 * be unit-tested and reused by the private UI and the public share page.
 */
export function paymentSummary(
  totalDue: number,
  totalPaid: number
): { due: number; paid: number; remaining: number; status: PaymentStatus } {
  const due = round2(totalDue);
  const paid = round2(totalPaid);
  const remaining = Math.max(0, round2(due - paid));
  let status: PaymentStatus = "unpaid";
  if (paid > 0) status = remaining <= 0 ? "paid" : "partial";
  return { due, paid, remaining, status };
}
