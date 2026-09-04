"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await requireUser();
  await auth.api.changePassword({
    body: { currentPassword, newPassword, revokeOtherSessions: true },
    headers: await headers(),
  });
}
