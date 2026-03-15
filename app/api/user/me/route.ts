import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/db/supabase-admin";
import {
  getReviewerMode,
  isFreeReviewer,
  isProReviewer,
  isReviewerEmail,
} from "@/lib/auth/reviewers";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: unknown, init?: ResponseInit) {
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

  if (
    host === "tonemender.com" ||
    host === "www.tonemender.com" ||
    host.endsWith(".tonemender.com")
  ) {
    return ".tonemender.com";
  }

  return undefined;
}

function isAndroidClient(req: Request) {
  return req.headers.get("x-tonemender-client") === "android";
}

function clearSessionCookie(req: Request, res: NextResponse) {
  const cookieDomain = isAndroidClient(req) ? undefined : getCookieDomain(req);

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
    const rawSessionToken = readCookie(req, SESSION_COOKIE);

    if (!rawSessionToken) {
      return jsonNoStore({ user: null });
    }

    const sessionTokenHash = sha256Hex(rawSessionToken);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select("user_id,expires_at,revoked_at")
      .eq("session_token_hash", sessionTokenHash)
      .maybeSingle();

    if (sessionError) {
      return jsonNoStore({ user: null }, { status: 503 });
    }

    if (!session?.user_id) {
      const res = jsonNoStore({ user: null });
      clearSessionCookie(req, res);
      return res;
    }

    const expiresMs = session.expires_at ? new Date(session.expires_at).getTime() : 0;

    if (session.revoked_at || !session.expires_at || expiresMs <= nowMs) {
      try {
        await supabaseAdmin
          .from("sessions")
          .update({ revoked_at: session.revoked_at ?? nowIso })
          .eq("session_token_hash", sessionTokenHash);
      } catch {}

      const res = jsonNoStore({ user: null });
      clearSessionCookie(req, res);
      return res;
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id,email,is_pro,plan_type,disabled_at,deleted_at")
      .eq("id", session.user_id)
      .maybeSingle();

    if (userError) {
      return jsonNoStore({ user: null }, { status: 503 });
    }

    if (!user || user.disabled_at || user.deleted_at) {
      const res = jsonNoStore({ user: null });
      clearSessionCookie(req, res);
      return res;
    }

    try {
      await supabaseAdmin
        .from("sessions")
        .update({ last_seen_at: nowIso })
        .eq("session_token_hash", sessionTokenHash)
        .is("revoked_at", null);
    } catch {}

    const email = String(user.email);
    const reviewerMode = getReviewerMode(email);
    const isReviewer = isReviewerEmail(email);

    let isPro = Boolean(user.is_pro);
    let planType = user.plan_type ?? null;

    if (isProReviewer(email)) {
      isPro = true;
      planType = "reviewer";
    } else if (isFreeReviewer(email)) {
      isPro = false;
      planType = null;
    }

    return jsonNoStore({
      user: {
        id: String(user.id),
        email,
        isPro,
        planType,
        isReviewer,
        reviewerMode,
      },
    });
  } catch {
    return jsonNoStore({ user: null }, { status: 500 });
  }
}