import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

// Fast cookie-presence gate only. Server Actions and API routes perform the
// authoritative better-auth session check on every call.
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.endsWith("better-auth.session_token"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Public, tokenized pages (report share + prospect onboarding), no session.
  if (pathname.startsWith("/r/") || pathname.startsWith("/onboard/")) {
    const { ok, retryAfter } = rateLimit(clientKey(request.headers, "share"), 60, 60_000);
    if (!ok) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
      });
    }
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const hasSession = hasSessionCookie(request);
  if (!hasSession && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Static assets (incl. fonts used by the OG-image route) bypass middleware.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|otf|woff|woff2)).*)",
  ],
};
