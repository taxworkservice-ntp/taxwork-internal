import { describe, expect, it } from "vitest";
import { stableFingerprint, whtExportFileName } from "@/lib/file-names";

describe("wht export filenames", () => {
  const base = {
    formType: "pnd3",
    issueDate: "2026-09-15",
    certificateNo: "WT6908001",
    payerName: "บริษัท ก",
    payeeName: "นาย ข",
    amount: "50000",
    description: "ค่าจ้างทำของ",
  };

  it("uses the certificate number when present", () => {
    expect(whtExportFileName(base)).toBe("wht-pnd3-2026-09-15-WT6908001.pdf");
  });

  it("is stable for identical inputs (re-export replaces, never duplicates)", () => {
    expect(whtExportFileName({ ...base, certificateNo: "" })).toBe(
      whtExportFileName({ ...base, certificateNo: "  " })
    );
  });

  it("differs across payees without a cert number", () => {
    const a = whtExportFileName({ ...base, certificateNo: "" });
    const b = whtExportFileName({ ...base, certificateNo: "", payeeName: "นาง ค" });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^wht-pnd3-2026-09-15-[0-9a-f]{6}\.pdf$/);
  });

  it("fingerprint is stable and ascii", () => {
    expect(stableFingerprint(["ก", "ข"])).toBe(stableFingerprint(["ก", "ข"]));
    expect(stableFingerprint(["ก"])).not.toBe(stableFingerprint(["ข"]));
  });
});
