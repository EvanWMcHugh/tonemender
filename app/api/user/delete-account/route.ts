import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { verifyAndroidPlayIntegrity } from "@/lib/security/play-integrity";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";
const ANDROID_CLIENT_HEADER = "android";
const ANDROID_PACKAGE_NAME = "com.tonemender.app";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
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
  return req.headers.get("x-tonemender-client") === ANDROID_CLIENT_HEADER;
}

async function rateLimitHit(key: string, windowSeconds: number, limit: number) {
  const now = Date.now();
  const windowStartSeconds = Math.floor(now / 1000 / windowSeconds) * windowSeconds;
  const windowStartIso = new Date(windowStartSeconds * 1000).toISOString();

  const { data: row } = await supabaseAdmin
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds)
    .maybeSingle();

  if (!row) {
    const { error: insErr } = await supabaseAdmin.from("rate_limits").insert({
      key,
      window_start: windowStartIso,
      window_seconds: windowSeconds,
      count: 1,
    });

    if (insErr) return true; // fail open
    return true;
  }

  const next = (row.count ?? 0) + 1;

  const { error: updErr } = await supabaseAdmin
    .from("rate_limits")
    .update({ count: next })
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds);

  if (updErr) return true; // fail open
  return next <= limit;
}

async function audit(
  event: string,
  userId: string | null,
  req: Request,
  meta: Record<string, unknown> = {}
) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      event,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      meta,
    });
  } catch {}
}

function clearSessionCookie(res: NextResponse, req: Request) {
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const turnstileToken = body?.turnstileToken;
    const integrityToken = body?.integrityToken;
    const integrityRequestHash = body?.integrityRequestHash;

    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);

    const ipAllowed = await rateLimitHit(`ip:${ip}:delete_account`, 60, 10);
    if (!ipAllowed) {
      return jsonNoStore({ error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const userAllowed = await rateLimitHit(`user:${authUser.id}:delete_account`, 300, 5);
    if (!userAllowed) {
      return jsonNoStore({ error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    if (androidClient) {
      if (!integrityToken || typeof integrityToken !== "string") {
        return jsonNoStore({ error: "Integrity verification required" }, { status: 400 });
      }

      if (!integrityRequestHash || typeof integrityRequestHash !== "string") {
        return jsonNoStore({ error: "Integrity request hash required" }, { status: 400 });
      }

      const integrity = await verifyAndroidPlayIntegrity({
        integrityToken,
        expectedPackageName: ANDROID_PACKAGE_NAME,
        expectedRequestHash: integrityRequestHash,
      });

      if (!integrity.ok) {
        await audit("ACCOUNT_DELETE_INTEGRITY_FAILED", authUser.id, req, {
          reason: integrity.reason,
          payload: integrity.payload ?? null,
        });

        return jsonNoStore(
          {
            error: integrity.publicMessage,
            reason: integrity.reason,
            payload:
              process.env.NODE_ENV === "development"
                ? integrity.payload ?? null
                : undefined,
          },
          { status: 403 }
        );
      }
    } else {
      if (!turnstileToken || typeof turnstileToken !== "string") {
        return jsonNoStore({ error: "Missing captcha" }, { status: 400 });
      }

      const okCaptcha = await verifyTurnstile(turnstileToken, getClientIp(req));
      if (!okCaptcha) {
        await audit("ACCOUNT_DELETE_CAPTCHA_FAILED", authUser.id, req, {});
        return jsonNoStore({ error: "Captcha failed" }, { status: 400 });
      }
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("id,email,stripe_customer_id,stripe_subscription_id,plan_type")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userError || !userRow) {
      return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    }

    await audit("ACCOUNT_DELETE_STARTED", authUser.id, req, {
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
      plan_type: userRow.plan_type ?? null,
      androidClient,
    });

    const { error: sessionsError } = await supabaseAdmin
      .from("sessions")
      .delete()
      .eq("user_id", authUser.id);

    if (sessionsError) {
      console.error("DELETE ACCOUNT: sessions delete failed:", sessionsError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: authTokensError } = await supabaseAdmin
      .from("auth_tokens")
      .delete()
      .eq("user_id", authUser.id);

    if (authTokensError) {
      console.error("DELETE ACCOUNT: auth_tokens delete failed:", authTokensError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: messagesError } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", authUser.id);

    if (messagesError) {
      console.error("DELETE ACCOUNT: messages delete failed:", messagesError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: rewriteUsageError } = await supabaseAdmin
      .from("rewrite_usage")
      .delete()
      .eq("user_id", authUser.id);

    if (rewriteUsageError) {
      console.error("DELETE ACCOUNT: rewrite_usage delete failed:", rewriteUsageError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: profilesError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("user_id", authUser.id);

    if (profilesError) {
      console.error("DELETE ACCOUNT: profiles delete failed:", profilesError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: auditNullError } = await supabaseAdmin
      .from("audit_log")
      .update({ user_id: null })
      .eq("user_id", authUser.id);

    if (auditNullError) {
      console.error("DELETE ACCOUNT: audit_log null-out failed:", auditNullError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: userDeleteError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", authUser.id);

    if (userDeleteError) {
      console.error("DELETE ACCOUNT: users delete failed:", userDeleteError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    await audit("ACCOUNT_DELETED", null, req, {
      deleted_user_id: authUser.id,
      deleted_email: userRow.email ?? null,
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
      plan_type: userRow.plan_type ?? null,
      androidClient,
    });

    const res = jsonNoStore({
      ok: true,
      success: true,
    });

    clearSessionCookie(res, req);
    return res;
  } catch (error) {
    console.error("DELETE ACCOUNT ROUTE ERROR:", error);
    return jsonNoStore(
      { error: "Server error while deleting account" },
      { status: 500 }
    );
  }
}