import { describe, expect, it } from "vitest";
import { sortUndownloadedFirst, splitUploads } from "@/lib/home-uploads";

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

describe("sortUndownloadedFirst", () => {
  it("moves downloaded files below undownloaded files", () => {
    const sorted = sortUndownloadedFirst(files, new Set(["other"]));
    expect(sorted.map((file) => file.id)).toEqual([
      "mine",
      "unknown",
      "blank",
      "other",
    ]);
  });

  it("preserves upload order within each group", () => {
    const sorted = sortUndownloadedFirst(files, new Set(["mine", "unknown"]));
    expect(sorted.map((file) => file.id)).toEqual([
      "other",
      "blank",
      "mine",
      "unknown",
    ]);
  });

  it("returns everything when nothing has been downloaded", () => {
    const sorted = sortUndownloadedFirst(files, new Set());
    expect(sorted.map((file) => file.id)).toEqual(files.map((file) => file.id));
  });
});
