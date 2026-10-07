import { NextResponse, type NextRequest } from "next/server";

/**
 * Gate for the admin surface. The console mixes public marketing pages with
 * internal admin pages that trigger privileged API calls (platform creation,
 * telemetry, audit). Those must never be reachable anonymously: the server
 * actions behind them attach a server-held admin bearer token.
 *
 * Auth: HTTP Basic against AUTH_BOX_CONSOLE_BASIC_AUTH ("user:password").
 * In production with no credential configured the admin routes fail closed.
 * Development stays open for local work.
 */
const ADMIN_PREFIXES = [
  "/platforms",
  "/metrics",
  "/accounts",
  "/assistants",
  "/audit",
  "/credentials",
  "/settings",
];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i % aBytes.length] ?? 0) ^ (bBytes[i % bBytes.length] ?? 0);
  }
  return diff === 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isAdminPath(pathname)) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const expected = process.env.AUTH_BOX_CONSOLE_BASIC_AUTH;
  if (!expected?.includes(":")) {
    // No credential configured: the admin surface does not exist publicly.
    return new NextResponse("Not found", { status: 404 });
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const presented = atob(header.slice(6));
      if (timingSafeEqual(presented, expected)) {
        return NextResponse.next();
      }
    } catch {
      // fall through to the challenge
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="authbox-console"' },
  });
}

export const config = {
  matcher: [
    "/platforms/:path*",
    "/metrics/:path*",
    "/accounts/:path*",
    "/assistants/:path*",
    "/audit/:path*",
    "/credentials/:path*",
    "/settings/:path*",
  ],
};
