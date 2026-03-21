// lib/auth/cookies.ts
import "server-only";

export const SESSION_COOKIE = "tm_session";

const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionCookieOptions = {
  maxAgeSeconds?: number;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
};

function encodeCookieValue(value: string): string {
  return encodeURIComponent(value);
}

export function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  if (!cookieHeader) return null;

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));

  return match ? decodeURIComponent(match[1]) : null;
}

export function getSessionCookie(req: Request): string | null {
  return readCookie(req, SESSION_COOKIE);
}

export function buildSetCookieHeader(
  name: string,
  value: string,
  {
    maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
    secure = process.env.NODE_ENV === "production",
    sameSite = "lax",
    path = "/",
  }: SessionCookieOptions = {}
): string {
  const parts = [
    `${name}=${encodeCookieValue(value)}`,
    `Path=${path}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildSessionCookie(value: string, options?: SessionCookieOptions): string {
  return buildSetCookieHeader(SESSION_COOKIE, value, options);
}

export function buildClearCookieHeader(
  name: string,
  {
    secure = process.env.NODE_ENV === "production",
    sameSite = "lax",
    path = "/",
  }: Omit<SessionCookieOptions, "maxAgeSeconds"> = {}
): string {
  const parts = [
    `${name}=`,
    `Path=${path}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearedSessionCookie(
  options?: Omit<SessionCookieOptions, "maxAgeSeconds">
): string {
  return buildClearCookieHeader(SESSION_COOKIE, options);
}