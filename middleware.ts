import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/cookies";

function isPublicPath(pathname: string): boolean {
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

  return pathname === "/blog" || pathname.startsWith("/blog/");
}

function isAlwaysAllowed(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    pathname === "/opengraph-image.png" ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/images")
  );
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isAlwaysAllowed(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = req.cookies.get(SESSION_COOKIE)?.value ?? null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/landing";

    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};