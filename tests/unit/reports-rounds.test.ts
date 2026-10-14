import { describe, expect, it } from "vitest";
import { planRoundMirror } from "@/lib/report-rounds";

describe("planRoundMirror", () => {
  it("fills empty counterparts and creates the missing rounds", () => {
    const steps = planRoundMirror(
      [
        { id: "s1", seq: 1 },
        { id: "s2", seq: 2 },
        { id: "s3", seq: 3 },
      ],
      [
        { id: "t1", seq: 1, filingCount: 4 },
        { id: "t2", seq: 2, filingCount: 0 },
      ]
    );
    expect(steps).toEqual([
      { action: "fill", seq: 2, sourceId: "s2", targetId: "t2" },
      { action: "create", seq: 3, sourceId: "s3" },
    ]);
  });

  it("never touches a round that already has items", () => {
    const steps = planRoundMirror(
      [{ id: "s1", seq: 1 }],
      [{ id: "t1", seq: 1, filingCount: 1 }]
    );
    expect(steps).toEqual([]);
  });

  it("does nothing when there is no source", () => {
    expect(planRoundMirror([], [{ id: "t1", seq: 1, filingCount: 0 }])).toEqual([]);
  });

  it("sorts by seq and ignores duplicate source rounds", () => {
    const steps = planRoundMirror(
      [
        { id: "s2", seq: 2 },
        { id: "s1", seq: 1 },
        { id: "s2dup", seq: 2 },
      ],
      []
    );
    expect(steps).toEqual([
      { action: "create", seq: 1, sourceId: "s1" },
      { action: "create", seq: 2, sourceId: "s2" },
    ]);
  });
});
