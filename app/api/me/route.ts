import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getCookieDomain(req: Request) {
  const host = req.headers.get("host") || "";
  if (host === "tonemender.com" || host === "www.tonemender.com" || host.endsWith(".tonemender.com")) {
    return ".tonemender.com";
  }
  return undefined;
}

function clearSessionCookie(req: Request, res: NextResponse) {
  const cookieDomain = getCookieDomain(req);
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    const raw = readCookie(req, SESSION_COOKIE);
    if (!raw) {
      return jsonNoStore(
        debug
          ? { user: null, reason: "no_cookie" }
          : { user: null }
      );
    }

    const hash = sha256Hex(raw);
    const nowIso = new Date().toISOString();

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("sessions")
      .select("user_id,expires_at,revoked_at,session_token_hash")
      .eq("session_token_hash", hash)
      .maybeSingle();

    if (sessionErr || !session?.user_id) {
      const payload = debug
        ? {
            user: null,
            reason: "session_not_found",
            rawFirst12: raw.slice(0, 12),
            hash,
            sessionErr,
            session,
          }
        : { user: null };

      const res = jsonNoStore(payload);
      clearSessionCookie(req, res);
      return res;
    }

    const expiresMs = session.expires_at ? new Date(session.expires_at).getTime() : 0;
    const nowMs = Date.now();

    if (session.revoked_at || !session.expires_at || expiresMs <= nowMs) {
      try {
        await supabaseAdmin
          .from("sessions")
          .update({ revoked_at: session.revoked_at ?? nowIso })
          .eq("session_token_hash", hash);
      } catch {}

      const payload = debug
        ? {
            user: null,
            reason: "session_expired_or_revoked",
            hash,
            session,
            nowIso,
            expiresMs,
            nowMs,
          }
        : { user: null };

      const res = jsonNoStore(payload);
      clearSessionCookie(req, res);
      return res;
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email,is_pro,plan_type,disabled_at,deleted_at")
      .eq("id", session.user_id)
      .maybeSingle();

   if (userErr || !user || user?.disabled_at || user?.deleted_at) {
  const payload = debug
    ? {
        user: null,
        reason: "user_lookup_failed",
        hash,
        session,
        userErr,
        userRecord: user,
      }
    : { user: null };

  const res = jsonNoStore(payload);
  clearSessionCookie(req, res);
  return res;
}

    try {
      await supabaseAdmin
        .from("sessions")
        .update({ last_seen_at: nowIso })
        .eq("session_token_hash", hash)
        .is("revoked_at", null);
    } catch {}

    return jsonNoStore(
      debug
        ? {
            ok: true,
            reason: "success",
            hash,
            session,
            user: {
              id: user.id,
              email: user.email,
              isPro: user.is_pro,
              planType: user.plan_type,
            },
          }
        : {
            user: {
              id: user.id,
              email: user.email,
              isPro: user.is_pro,
              planType: user.plan_type,
            },
          }
    );
  } catch (err: any) {
  console.error("ME ROUTE ERROR:", err);

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  return jsonNoStore(
    debug
      ? {
          user: null,
          reason: "catch_block",
          error: err?.message ?? String(err),
          stack: err?.stack ?? null,
        }
      : { user: null }
  );
}
}