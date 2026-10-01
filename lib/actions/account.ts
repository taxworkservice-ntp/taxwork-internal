"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await requireUser();
  await auth.api.changePassword({
    body: { currentPassword, newPassword, revokeOtherSessions: true },
    headers: await headers(),
  });
}

export type LoginAccount = { email: string; name: string };

/**
 * Accounts that can sign in with a password only (no email field on the
 * login screen). Password-only login tries the entered password against
 * each of these until one matches, so each person's own password picks
 * their account. Internal 2-user tool: emails are not secret.
 */
export async function listLoginAccounts(): Promise<LoginAccount[]> {
  const rows = (await sql`
    select email, coalesce(nullif(name, ''), email) as name
    from "user" order by email`) as { email: string; name: string }[];
  return rows.map((r) => ({ email: r.email, name: r.name }));
}

