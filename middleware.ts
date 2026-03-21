import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "tm_session";

function isPublicPath(pathname: string) {
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
  const { pathname, search } = req.nextUrl;

  if (isAlwaysAllowed(pathname)) return NextResponse.next();
  if (isPublicPath(pathname)) return NextResponse.next();

  const session = req.cookies.get(SESSION_COOKIE)?.value ?? null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/landing";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};