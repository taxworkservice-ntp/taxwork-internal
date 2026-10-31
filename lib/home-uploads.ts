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
 * Return uploads newer than the stored last-seen timestamp. A missing or
 * invalid timestamp deliberately yields no "new" badges (first visit).
 */
export function findNewUploads<T extends { id: string; uploaded_at: string }>(
  files: T[],
  lastSeen: number | null
): T[] {
  if (lastSeen == null || !Number.isFinite(lastSeen)) return [];

  return files.filter((file) => {
    const uploaded = new Date(file.uploaded_at).getTime();
    return Number.isFinite(uploaded) && uploaded > lastSeen;
  });
}
