"use server";

import { sql } from "@/lib/db";

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

