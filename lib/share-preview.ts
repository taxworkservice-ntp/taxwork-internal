/**
 * Builds the text shown in link previews (LINE, etc.) for a public report
 * share link. Kept pure and out of the server-action module so it can be
 * unit-tested and imported by the edge-runtime OG image route.
 *
 * The preview is fetched by unauthenticated crawlers, so the *amount of detail*
 * is configurable (`share_preview_detail`). Higher levels reveal the period,
 * client name, and total in the chat card for anyone holding the link.
 */

import { formatBaht } from "@/lib/report-format";

export const DEFAULT_SHARE_PREVIEW_TITLE = "รายงานภาษี";

const CONFIRM_TAIL =
  "กรุณายืนยันตัวตนด้วยเลขท้าย 4 หลักของเลขประจำตัวผู้เสียภาษีเพื่อเปิดรายงาน";

/** How much report detail is allowed in an unauthenticated link preview. */
export type SharePreviewDetail = "none" | "period" | "client" | "amount";

const DETAIL_ORDER: SharePreviewDetail[] = ["none", "period", "client", "amount"];

export const DEFAULT_SHARE_PREVIEW_DETAIL: SharePreviewDetail = "amount";

export function normalizeSharePreviewDetail(
  value: string | null | undefined
): SharePreviewDetail {
  return DETAIL_ORDER.includes(value as SharePreviewDetail)
    ? (value as SharePreviewDetail)
    : DEFAULT_SHARE_PREVIEW_DETAIL;
}

function atLeast(detail: SharePreviewDetail, level: SharePreviewDetail): boolean {
  return DETAIL_ORDER.indexOf(detail) >= DETAIL_ORDER.indexOf(level);
}

export function defaultSharePreviewDescription(firmName?: string | null): string {
  const firm = firmName?.trim();
  return firm ? `ลิงก์รายงานภาษีจาก ${firm} — ${CONFIRM_TAIL}` : `ลิงก์รายงานภาษี — ${CONFIRM_TAIL}`;
}

export type SharePreviewInput = {
  title?: string | null;
  description?: string | null;
  firmName?: string | null;
  detail?: SharePreviewDetail | null;
  periodTh?: string | null;
  label?: string | null;
  clientName?: string | null;
  total?: number | null;
};

export type SharePreview = { title: string; description: string };

export function buildSharePreview(input: SharePreviewInput = {}): SharePreview {
  const detail = normalizeSharePreviewDetail(input.detail);
  const customTitle = input.title?.trim() || null;
  const customDescription = input.description?.trim() || null;
  const firm = input.firmName?.trim() || null;
  const period = input.periodTh?.trim() || null;
  const label = input.label?.trim() || null;
  const client = input.clientName?.trim() || null;
  const total = Number(input.total ?? 0);

  // A configured title is used verbatim (full override); otherwise the default
  // base gets the level's detail appended.
  let title: string;
  if (customTitle) {
    title = customTitle;
  } else {
    title = DEFAULT_SHARE_PREVIEW_TITLE;
    if (atLeast(detail, "period") && period) {
      title = `${title} ${period}${label ? ` ${label}` : ""}`;
      if (atLeast(detail, "client") && client) title += ` — ${client}`;
    }
  }

  let description: string;
  if (customDescription) {
    description = customDescription;
  } else if (atLeast(detail, "amount") && total > 0) {
    const head = firm ? `จาก ${firm}` : "ลิงก์รายงานภาษี";
    description = `${head} · ยอดนำส่งรวม ฿${formatBaht(total)} บาท — ${CONFIRM_TAIL}`;
  } else {
    description = defaultSharePreviewDescription(firm);
  }

  return { title, description };
}
