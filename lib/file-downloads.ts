// Server-only helpers for per-user file download tracking.
import { sql } from "@/lib/db";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Record that a user downloaded a known file. Re-downloads refresh the time. */
export async function recordFileDownload(
  fileId: string,
  userEmail: string
): Promise<void> {
  const email = normalizeEmail(userEmail);
  if (!fileId || !email) return;
  await sql`insert into file_downloads (file_id, user_email, downloaded_at)
    values (${fileId}, ${email}, now())
    on conflict (file_id, user_email) do update set downloaded_at = now()`;
}

/**
 * Record a download by storage path. The download proxy only receives the R2
 * path, so resolve the owning file row here.
 */
export async function recordFileDownloadByPath(
  storagePath: string,
  userEmail: string
): Promise<void> {
  const email = normalizeEmail(userEmail);
  if (!storagePath || !email) return;
  await sql`insert into file_downloads (file_id, user_email, downloaded_at)
    select id, ${email}, now() from files where storage_path = ${storagePath}
    on conflict (file_id, user_email) do update set downloaded_at = now()`;
}

/** All file IDs the given user has downloaded. */
export async function listDownloadedFileIds(userEmail: string): Promise<string[]> {
  const email = normalizeEmail(userEmail);
  if (!email) return [];
  const rows = (await sql`select file_id::text as file_id
    from file_downloads where user_email = ${email}`) as { file_id: string }[];
  return rows.map((row) => String(row.file_id));
}
