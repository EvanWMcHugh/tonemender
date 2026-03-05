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
    const raw = readCookie(req, SESSION_COOKIE);
    if (!raw) return jsonNoStore({ user: null });

    const hash = sha256Hex(raw);
    const nowIso = new Date().toISOString();

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("sessions")
      .select("user_id,expires_at,revoked_at")
      .eq("session_token_hash", hash)
      .maybeSingle();

    if (sessionErr || !session?.user_id) {
      const res = jsonNoStore({ user: null });
      clearSessionCookie(req, res);
      return res;
    }

    if (session.revoked_at || !session.expires_at || session.expires_at <= nowIso) {
      // Best-effort cleanup
      try {
        await supabaseAdmin
          .from("sessions")
          .update({ revoked_at: session.revoked_at ?? nowIso })
          .eq("session_token_hash", hash);
      } catch {}

      const res = jsonNoStore({ user: null });
      clearSessionCookie(req, res);
      return res;
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email,is_pro,plan_type,disabled_at,deleted_at")
      .eq("id", session.user_id)
      .maybeSingle();

    if (userErr || !user || user.disabled_at || user.deleted_at) {
      const res = jsonNoStore({ user: null });
      clearSessionCookie(req, res);
      return res;
    }

    // Best-effort last_seen_at (don’t block response)
    try {
      await supabaseAdmin
        .from("sessions")
        .update({ last_seen_at: nowIso })
        .eq("session_token_hash", hash)
        .is("revoked_at", null);
    } catch {}

    return jsonNoStore({
      user: {
        id: user.id,
        email: user.email,
        isPro: user.is_pro,
        planType: user.plan_type,
      },
    });
  } catch (err) {
    console.error("ME ROUTE ERROR:", err);
    return jsonNoStore({ user: null });
  }
}