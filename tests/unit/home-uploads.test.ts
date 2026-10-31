import { describe, expect, it } from "vitest";
import { findNewUploads, splitUploads } from "@/lib/home-uploads";

type File = {
  id: string;
  uploaded_by: string | null;
  uploaded_at: string;
};

const files: File[] = [
  { id: "mine", uploaded_by: "Mum@Example.com", uploaded_at: "2026-10-01T10:00:00.000Z" },
  { id: "other", uploaded_by: "team@example.com", uploaded_at: "2026-10-02T10:00:00.000Z" },
  { id: "unknown", uploaded_by: null, uploaded_at: "2026-10-03T10:00:00.000Z" },
  { id: "blank", uploaded_by: "   ", uploaded_at: "2026-10-04T10:00:00.000Z" },
];

describe("splitUploads", () => {
  it("matches the viewer email case-insensitively", () => {
    const { mine, team } = splitUploads(files, "mum@example.com");
    expect(mine.map((file) => file.id)).toEqual(["mine"]);
    expect(team.map((file) => file.id)).toEqual(["other", "unknown", "blank"]);
  });

  it("treats missing or blank uploaders as team uploads", () => {
    const { team } = splitUploads(files, "mum@example.com");
    expect(team.map((file) => file.id)).toContain("unknown");
    expect(team.map((file) => file.id)).toContain("blank");
  });
});

describe("findNewUploads", () => {
  it("returns nothing on a first visit", () => {
    expect(findNewUploads(files, null)).toEqual([]);
    expect(findNewUploads(files, Number.NaN)).toEqual([]);
  });

  it("returns files uploaded after the last-seen timestamp", () => {
    const lastSeen = new Date("2026-10-02T10:00:00.000Z").getTime();
    expect(findNewUploads(files, lastSeen).map((file) => file.id)).toEqual([
      "unknown",
      "blank",
    ]);
  });

  it("ignores invalid upload dates", () => {
    const lastSeen = new Date("2026-10-01T00:00:00.000Z").getTime();
    const result = findNewUploads(
      [{ id: "bad", uploaded_by: null, uploaded_at: "not-a-date" }],
      lastSeen
    );
    expect(result).toEqual([]);
  });
});
