// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "tm_session";

/**
 * Public routes: marketing + SEO + legal pages.
 * Everything else matched by config.matcher is considered protected.
 */
function isPublicPath(pathname: string) {
  // Exact public pages
  if (
    pathname === "/landing" ||
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/check-email" ||
    pathname === "/reset-password" ||
    pathname === "/confirm" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/relationship-message-rewriter"
  ) {
    return true;
  }

  // Public sections
  if (pathname === "/blog" || pathname.startsWith("/blog/")) return true;

  return false;
}

function isAlwaysAllowed(pathname: string) {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/sitemap") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/images")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip for Next internals, static assets, API, etc.
  if (isAlwaysAllowed(pathname)) return NextResponse.next();

  // Allow public pages through
  if (isPublicPath(pathname)) return NextResponse.next();

  // Everything else is protected (app pages)
  const session = req.cookies.get(SESSION_COOKIE)?.value ?? null;

  // Edge-safe auth gate: cookie must exist.
  // DB/session validation happens in Node runtime (API routes).
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/landing";

    // Optional UX: allow redirecting back after login
    url.searchParams.set("next", pathname);

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Apply middleware to all pages except static assets.
 * (API is handled by isAlwaysAllowed)
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};