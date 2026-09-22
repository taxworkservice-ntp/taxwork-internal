import "server-only";

/**
 * Resolve the public origin used for client-facing share links. Prefers an
 * explicit NEXT_PUBLIC_APP_URL, then the current request's host (so preview /
 * local deployments generate links that work on that same host), then
 * BETTER_AUTH_URL, then the production domain.
 */

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export type OriginInput = {
  override?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
  fallback?: string | null;
};

export function resolveOrigin(input: OriginInput): string {
  const override = input.override?.trim();
  if (override) return stripTrailingSlash(override);

  const host = input.forwardedHost?.trim() || input.host?.trim();
  if (host) {
    const proto = input.forwardedProto?.trim() || "https";
    return `${proto}://${host}`;
  }

  const fallback = input.fallback?.trim();
  if (fallback) return stripTrailingSlash(fallback);

  return "https://internal.taxworkaccount.com";
}

export async function appOrigin(): Promise<string> {
  let forwardedHost: string | null = null;
  let host: string | null = null;
  let forwardedProto: string | null = null;
  try {
    const mod = await import("next/headers");
    const h = await mod.headers();
    forwardedHost = h.get("x-forwarded-host");
    host = h.get("host");
    forwardedProto = h.get("x-forwarded-proto");
  } catch {
    // Outside a request scope (e.g. build/CI) — fall back to env.
  }
  return resolveOrigin({
    override: process.env.NEXT_PUBLIC_APP_URL,
    forwardedHost,
    host,
    forwardedProto,
    fallback: process.env.BETTER_AUTH_URL,
  });
}
