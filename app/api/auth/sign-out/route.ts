import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}

// Share cookie across tonemender.com + www.tonemender.com
function getCookieDomain(req: Request) {
  const host = req.headers.get("host") || "";
  if (host === "tonemender.com" || host === "www.tonemender.com" || host.endsWith(".tonemender.com")) {
    return ".tonemender.com";
  }
  return undefined;
}

async function audit(event: string, req: Request, meta: Record<string, any> = {}) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: null,
      event,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      meta,
    });
  } catch {}
}

export async function POST(req: Request) {
  const nowIso = new Date().toISOString();

  try {
    const raw = readCookie(req, SESSION_COOKIE);

    if (raw) {
      const hash = sha256Hex(raw);

      // Revoke rather than delete (keeps auditability)
      try {
        await supabaseAdmin
          .from("sessions")
          .update({ revoked_at: nowIso })
          .eq("session_token_hash", hash)
          .is("revoked_at", null);
      } catch {
        // If revoke fails, fall back to delete best-effort
        try {
          await supabaseAdmin.from("sessions").delete().eq("session_token_hash", hash);
        } catch {}
      }
    }

    await audit("SIGN_OUT_OK", req, {});
  } catch (err) {
    // Best-effort logout: never block client
    console.warn("SIGN OUT CLEANUP WARNING:", err);
  }

  const res = jsonNoStore({ ok: true });

  const cookieDomain = getCookieDomain(req);

  // Clear cookie (match domain used at sign-in)
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  return res;
}