/**
 * Builds the text shown in link previews (LINE, etc.) for a public report
 * share link. Kept pure and out of the server-action module so it can be
 * unit-tested. The preview is fetched by unauthenticated crawlers, so only
 * firm-level branding belongs here — never client names or amounts.
 */

export const DEFAULT_SHARE_PREVIEW_TITLE = "รายงานภาษี";

export function defaultSharePreviewDescription(firmName?: string | null): string {
  const firm = firmName?.trim();
  const tail =
    "กรุณายืนยันตัวตนด้วยเลขท้าย 4 หลักของเลขประจำตัวผู้เสียภาษีเพื่อเปิดรายงาน";
  return firm ? `ลิงก์รายงานภาษีจาก ${firm} — ${tail}` : `ลิงก์รายงานภาษี — ${tail}`;
}

export type SharePreviewInput = {
  title?: string | null;
  description?: string | null;
  firmName?: string | null;
};

export type SharePreview = { title: string; description: string };

export function buildSharePreview(input: SharePreviewInput = {}): SharePreview {
  return {
    title: input.title?.trim() || DEFAULT_SHARE_PREVIEW_TITLE,
    description:
      input.description?.trim() || defaultSharePreviewDescription(input.firmName),
  };
}
