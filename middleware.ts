// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "tm_session";

// Routes that require login
const PROTECTED_PREFIXES = ["/", "/rewrite", "/drafts", "/account", "/upgrade"];

// Routes that should stay public
const PUBLIC_PREFIXES = [
  "/landing",
  "/sign-in",
  "/sign-up",
  "/confirm-signup",
  "/check-email",
  "/reset-password",
  "/privacy",
  "/terms",
  "/blog",
];

// Always allow these (api, next internals, static, etc.)
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

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) =>
    p === "/" ? pathname === "/" : pathname.startsWith(p)
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isAlwaysAllowed(pathname)) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  // Only gate routes you explicitly protect
  if (!isProtected(pathname)) return NextResponse.next();

  const raw = req.cookies.get(SESSION_COOKIE)?.value ?? null;

  // Edge-safe auth gate: cookie must exist
  // (DB verification happens in your API routes, which are Node runtime.)
  if (!raw) {
    const url = req.nextUrl.clone();
    url.pathname = "/landing";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};