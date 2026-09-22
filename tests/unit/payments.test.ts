import { describe, expect, it } from "vitest";
import { paymentSummary } from "@/lib/payments";

describe("paymentSummary", () => {
  it("is unpaid with nothing paid", () => {
    const s = paymentSummary(5000, 0);
    expect(s.status).toBe("unpaid");
    expect(s.remaining).toBe(5000);
  });

  it("is partial when some is paid", () => {
    const s = paymentSummary(5000, 2000);
    expect(s.status).toBe("partial");
    expect(s.paid).toBe(2000);
    expect(s.remaining).toBe(3000);
  });

  it("is paid when fully settled", () => {
    const s = paymentSummary(5000, 5000);
    expect(s.status).toBe("paid");
    expect(s.remaining).toBe(0);
  });

  it("is paid (no negative remaining) when overpaid", () => {
    const s = paymentSummary(5000, 6000);
    expect(s.status).toBe("paid");
    expect(s.remaining).toBe(0);
  });

  it("avoids float drift", () => {
    const s = paymentSummary(0.1 + 0.2, 0.3);
    expect(s.status).toBe("paid");
  });

  it("handles a zero-amount round", () => {
    const s = paymentSummary(0, 0);
    expect(s.status).toBe("unpaid");
    expect(s.remaining).toBe(0);
  });
});
