/**
 * Client-safe intake constants (no server-only imports) — shared by the public
 * form and the server helpers.
 */

export const INTAKE_CONSENT_VERSION = "2026-10";

export const INTAKE_TIMELINE_NOTE =
  "หมายเหตุ: ระยะเวลาดำเนินงานประมาณ 5–7 วันทำการ ทั้งนี้ ความช้าเร็วขึ้นอยู่กับระยะเวลาการอนุมัติของนายทะเบียน";

export const INTAKE_MIN_SHAREHOLDERS = 2;
export const INTAKE_MAX_SHAREHOLDERS = 10;

export const ID_FRONT_EXAMPLE_URL = "/onboard/id-front-example.jpg";
export const ID_BACK_EXAMPLE_URL = "/onboard/id-back-example.jpg";

export type ShareholderIdDocs = {
  idCardFrontPath?: string | null;
  idCardBackPath?: string | null;
  /** Legacy single upload (pre front/back split) — fallback only. */
  idCardPath?: string | null;
};

/**
 * Resolve a shareholder's ID uploads to front/back paths. Old rows that only
 * have the legacy single `idCardPath` fall back to it for both sides.
 */
export function shareholderIdDocs(sh: ShareholderIdDocs): { front: string; back: string } {
  const front = sh.idCardFrontPath?.trim() || sh.idCardPath?.trim() || "";
  const back = sh.idCardBackPath?.trim() || sh.idCardPath?.trim() || "";
  return { front, back };
}
