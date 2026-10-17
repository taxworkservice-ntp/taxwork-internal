import { describe, expect, it } from "vitest";
import { shareholderIdDocs } from "@/lib/intake-shared";

describe("shareholderIdDocs", () => {
  it("returns front and back paths", () => {
    expect(
      shareholderIdDocs({ idCardFrontPath: "intake/x/front.jpg", idCardBackPath: "intake/x/back.jpg" })
    ).toEqual({ front: "intake/x/front.jpg", back: "intake/x/back.jpg" });
  });

  it("falls back to the legacy single upload for both sides", () => {
    expect(shareholderIdDocs({ idCardPath: "intake/x/id.jpg" })).toEqual({
      front: "intake/x/id.jpg",
      back: "intake/x/id.jpg",
    });
  });

  it("prefers explicit front/back over legacy", () => {
    expect(
      shareholderIdDocs({
        idCardPath: "intake/x/old.jpg",
        idCardFrontPath: "intake/x/f.jpg",
        idCardBackPath: "intake/x/b.jpg",
      })
    ).toEqual({ front: "intake/x/f.jpg", back: "intake/x/b.jpg" });
  });

  it("returns empty strings when nothing is present", () => {
    expect(shareholderIdDocs({})).toEqual({ front: "", back: "" });
  });

  it("trims whitespace", () => {
    expect(shareholderIdDocs({ idCardFrontPath: "  a.jpg  " })).toEqual({ front: "a.jpg", back: "" });
  });
});
