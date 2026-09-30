/**
 * Stable, human-readable export filenames. Filenames double as the archive
 * identity: re-exporting the same certificate must produce the same name so
 * history can replace instead of duplicating.
 */

/** FNV-1a 32-bit fingerprint, 6 hex chars. Identity use only, not security. */
export function stableFingerprint(parts: (string | number | null | undefined)[]): string {
  let h = 0x811c9dc5;
  const s = parts.map((p) => String(p ?? "")).join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

export function sanitizeFileToken(raw: string): string {
  return raw.trim().replace(/[^A-Za-z0-9-_]/g, "");
}

export function whtExportFileName(opts: {
  formType: string;
  issueDate: string;
  certificateNo: string;
  payerName: string;
  payeeName: string;
  amount: string;
  description: string;
}): string {
  const form = opts.formType.replace(/[^a-z0-9]/gi, "") || "pnd";
  const date = opts.issueDate.replace(/[^0-9-]/g, "") || "nodate";
  const cert = sanitizeFileToken(opts.certificateNo);
  const tag =
    cert ||
    stableFingerprint([
      opts.payerName,
      opts.payeeName,
      opts.amount,
      opts.description,
      opts.formType,
    ]);
  return `wht-${form}-${date}-${tag}.pdf`;
}
