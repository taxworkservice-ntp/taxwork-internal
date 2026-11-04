export type HomeUploadFile = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
};

export type SplitUploads<T> = {
  mine: T[];
  team: T[];
};

/**
 * Split files by uploader. Unknown uploaders (null/empty) are treated as team
 * uploads so they never disappear from the landing page.
 */
export function splitUploads<T extends { uploaded_by: string | null }>(
  files: T[],
  viewerEmail: string
): SplitUploads<T> {
  const email = viewerEmail.trim().toLowerCase();
  const mine: T[] = [];
  const team: T[] = [];

  for (const file of files) {
    const uploader = (file.uploaded_by ?? "").trim().toLowerCase();
    if (email && uploader === email) mine.push(file);
    else team.push(file);
  }

  return { mine, team };
}

/**
 * Stable-sort undownloaded files first, preserving upload order within each
 * group. Keeps the next action at the top of each list.
 */
export function sortUndownloadedFirst<T extends { id: string }>(
  files: T[],
  downloadedIds: ReadonlySet<string>
): T[] {
  return [...files].sort(
    (a, b) => Number(downloadedIds.has(a.id)) - Number(downloadedIds.has(b.id))
  );
}
