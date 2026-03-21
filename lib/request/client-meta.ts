// lib/request/client-meta.ts
import "server-only";

export type ClientPlatform = "web" | "android" | "ios" | "unknown";

export function getClientIp(req: Request): string | null {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return null;
}

export function getUserAgent(req: Request): string | null {
  const userAgent = req.headers.get("user-agent");
  return userAgent?.trim() || null;
}

export function getClientPlatform(req: Request): ClientPlatform {
  const raw = (req.headers.get("x-client-platform") || "").trim().toLowerCase();

  if (raw === "web" || raw === "android" || raw === "ios") {
    return raw;
  }

  return "unknown";
}