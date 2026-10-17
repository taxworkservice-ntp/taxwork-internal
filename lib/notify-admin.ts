import "server-only";
import { sendEmail } from "@/lib/email/resend";
import { buildIntakeNotifyEmail } from "@/lib/email/intake-email";
import { adminLineRecipients, buildIntakeLineText, pushLineText } from "@/lib/line";
import { appOrigin } from "@/lib/app-url";

/**
 * Single choke point for staff intake notifications (email + LINE). Callers
 * pass only content — never a recipient. Email always goes to USER_ALLOWLIST
 * and LINE always goes to ADMIN_LINE_USER_IDS, so client-derived data can
 * never become a recipient. Best-effort: never throws.
 */

export type IntakeAdminNotice = {
  company: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  ref: string;
};

export type NotifyAdminResult = {
  email: "sent" | "skipped" | "failed";
  line: { to: string; ok: boolean; error?: string }[];
};

export async function notifyAdminsIntake(input: IntakeAdminNotice): Promise<NotifyAdminResult> {
  const result: NotifyAdminResult = { email: "skipped", line: [] };
  try {
    const origin = await appOrigin();
    const reviewUrl = `${origin}/onboarding`;

    const staffEmails = (process.env.USER_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (staffEmails.length && process.env.REPORT_FROM_EMAIL) {
      const built = buildIntakeNotifyEmail({
        name: input.company,
        juristicId: "— (รอจดทะเบียน)",
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        reviewUrl,
      });
      try {
        await sendEmail({
          to: staffEmails.join(","),
          subject: built.subject,
          html: built.html,
          text: built.text,
        });
        result.email = "sent";
      } catch (error) {
        console.error("intake notify email failed:", error);
        result.email = "failed";
      }
    }

    const text = buildIntakeLineText({
      company: input.company,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      ref: input.ref,
      reviewUrl,
    });
    for (const to of adminLineRecipients()) {
      try {
        const res = await pushLineText({ to, text });
        result.line.push(res.ok ? { to, ok: true } : { to, ok: false, error: res.error });
        if (!res.ok) console.error("intake LINE notify failed:", res.error);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("intake LINE notify failed:", message);
        result.line.push({ to, ok: false, error: message });
      }
    }
  } catch (error) {
    console.error("notifyAdminsIntake failed:", error);
  }
  return result;
}
