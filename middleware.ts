import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// These pages require the user to be logged in
const PROTECTED_ROUTES = ["/rewrite", "/account", "/drafts", "/upgrade"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect the routes in the list
  if (!PROTECTED_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Read Supabase auth cookie
  const token = req.cookies.get(
    "sb-ykkqgjypppuvmiigxyjt-auth-token"
  );

  // If no auth cookie → redirect to sign-in
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("error", "not-authenticated");
    return NextResponse.redirect(url);
  }

  // Otherwise allow the request to continue
  return NextResponse.next();
}

export const config = {
  matcher: ["/rewrite", "/account", "/drafts", "/upgrade"],
};