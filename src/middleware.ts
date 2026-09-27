import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ios_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Server-to-server endpoints authenticated by signatures/tokens instead of cookies.
const CSRF_EXEMPT = ["/api/v1/billing/webhooks/", "/api/v1/hooks/", "/api/v1/email/track/", "/api/v1/email/unsubscribe/"];

function allowedOrigins(req: NextRequest): Set<string> {
  const set = new Set<string>([req.nextUrl.origin]);
  if (process.env.APP_URL) set.add(new URL(process.env.APP_URL).origin);
  for (const o of (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) set.add(o);
  return set;
}

/** Same-origin check against the host the browser actually addressed (works behind proxies and by IP or domain). */
function sameHost(req: NextRequest, origin: string): boolean {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  // CSRF defence-in-depth (cookies are SameSite=Lax): state-changing API calls must come from our origin.
  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(req.method) && !CSRF_EXEMPT.some((p) => pathname.startsWith(p))) {
    const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
    if (!origin || !(allowedOrigins(req).has(origin) || sameHost(req, origin))) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-origin request blocked" } }, { status: 403 });
    }
  }

  // CORS preflight for configured origins.
  if (pathname.startsWith("/api/") && req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    const res = new NextResponse(null, { status: 204 });
    if (origin && allowedOrigins(req).has(origin)) {
      res.headers.set("access-control-allow-origin", origin);
      res.headers.set("access-control-allow-credentials", "true");
      res.headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE");
      res.headers.set("access-control-allow-headers", "content-type,x-workspace-id");
      res.headers.set("vary", "origin");
    }
    return res;
  }

  // Page protection (full session validation happens server-side in layouts).
  if ((pathname.startsWith("/app") || pathname.startsWith("/admin")) && !req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-pathname", pathname);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|og).*)"],
};
