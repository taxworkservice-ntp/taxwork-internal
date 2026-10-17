/**
 * Minimal LINE Messaging API client (push only). Plain `fetch`, no SDK.
 * Used for best-effort staff notifications — failures must never block the
 * caller's main flow.
 */

export type LinePushResult = { ok: true } | { ok: false; error: string };

/** Short Thai summary for a new company-registration intake. */
export function buildIntakeLineText(input: {
  company: string;
  contactName: string;
  contactPhone: string;
  ref: string;
  reviewUrl: string;
}): string {
  const company = input.company.trim() || "(ไม่ระบุชื่อ)";
  return [
    `📋 จดทะเบียนบริษัทใหม่: ${company}`,
    `ผู้ติดต่อ ${input.contactName} ${input.contactPhone} · ref ${input.ref}`,
    `เปิดดู: ${input.reviewUrl}`,
  ].join("\n");
}

export async function pushLineText(opts: {
  to: string;
  text: string;
  token?: string;
  timeoutMs?: number;
}): Promise<LinePushResult> {
  const token = opts.token ?? process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN is not set" };
  if (!opts.to) return { ok: false, error: "empty recipient" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({ to: opts.to, messages: [{ type: "text", text: opts.text }] }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `LINE push ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Recipient user/group IDs from env (comma-separated). */
export function adminLineRecipients(): string[] {
  return (process.env.ADMIN_LINE_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
