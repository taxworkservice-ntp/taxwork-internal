import "server-only";
import { Resend } from "resend";

/**
 * Thin Resend client wrapper. Server-only: the API key must never reach the
 * browser. Configuration lives in env vars (see MASTER.md §8):
 *   RESEND_API_KEY     – Resend API key
 *   REPORT_FROM_EMAIL  – verified sender, e.g. "Taxwork Account <reports@…>"
 *   REPORT_REPLY_TO    – optional reply-to address
 */

let client: Resend | null = null;

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  if (!client) client = new Resend(key);
  return client;
}

export type EmailAttachment = {
  filename: string;
  /** Raw bytes — the SDK base64-encodes them. */
  content: Buffer;
  contentType?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Stable key so a retried send never delivers twice. */
  idempotencyKey?: string;
};

export type SendEmailResult = { id: string | null };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.REPORT_FROM_EMAIL?.trim();
  if (!from) throw new Error("REPORT_FROM_EMAIL is not set");
  const replyTo = process.env.REPORT_REPLY_TO?.trim() || undefined;

  const { data, error } = await getClient().emails.send(
    {
      from,
      to: input.to,
      replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
  );

  if (error) throw new Error(error.message || "ส่งอีเมลไม่สำเร็จ");
  return { id: data?.id ?? null };
}
