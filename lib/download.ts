/** ASCII-safe fallback filename for the Content-Disposition header. */
export function asciiFileName(name: string): string {
  const cleaned = name
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .trim();
  return cleaned || "download";
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
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = params.fileName?.trim() || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
