/** ASCII-safe fallback filename for the Content-Disposition header. */
export function asciiFileName(name: string): string {
  const cleaned = name
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .trim();
  return cleaned || "download";
}

/**
 * Save a Blob to the device via a temporary object URL + a hidden anchor. The
 * object URL is revoked on a delay: revoking immediately can abort the download
 * in some browsers (notably Safari).
 */
export function saveBlob(blob: Blob, fileName?: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName?.trim() || "download";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Fetch a same-origin URL and save the response body to the device as a file.
 * Used for the client-facing share PDF so the tap results in a real save rather
 * than a preview/blank tab. Throws so callers can fall back to navigation.
 */
export async function downloadFromUrl(
  url: string,
  fileName?: string
): Promise<void> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`ดาวน์โหลดไม่สำเร็จ (HTTP ${res.status})`);
  }
  saveBlob(await res.blob(), fileName);
}

/**
 * Trigger a browser download for a private R2 object through the same-origin
 * proxy. Returning a promise lets callers show busy state.
 */
export async function downloadStoredFile(params: {
  storagePath: string;
  fileName?: string;
}): Promise<void> {
  const res = await fetch("/api/files/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    let message = `ดาวน์โหลดไม่สำเร็จ (HTTP ${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = String(j.error);
    } catch {
      // keep default
    }
    throw new Error(message);
  }
  saveBlob(await res.blob(), params.fileName);
}
