import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

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

async function audit(event: string, userId: string | null, req: Request, meta: Record<string, any> = {}) {
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

async function getUserIdFromSession(req: Request) {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;

  const hash = sha256Hex(raw);
  const nowIso = new Date().toISOString();

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at,revoked_at")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (error || !session?.user_id) return null;
  if (session.revoked_at) return null;
  if (!session.expires_at || session.expires_at <= nowIso) return null;

  return String(session.user_id);
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromSession(req);
    if (!userId) return jsonNoStore({ error: "Unauthorized" }, { status: 401 });

    const nowIso = new Date().toISOString();

    // Load user info for reconciliation / UI
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,stripe_customer_id,stripe_subscription_id,plan_type,deleted_at,disabled_at")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !userRow) return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    if (userRow.deleted_at) return jsonNoStore({ ok: true, success: true }); // idempotent
    if (userRow.disabled_at) {
      // Optional: allow delete even if disabled; leaving as allowed.
    }

    // Best-effort cleanup. Prefer soft-delete user first so even if cleanup fails,
    // account is effectively gone immediately.
    const { error: softErr } = await supabaseAdmin
      .from("users")
      .update({
        deleted_at: nowIso,
        // Optional: also disable immediately
        disabled_at: nowIso,
        // Optional: remove pro flags immediately
        is_pro: false,
        plan_type: null,
      })
      .eq("id", userId);

    if (softErr) return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });

    // Revoke sessions (best effort)
    try {
      await supabaseAdmin
        .from("sessions")
        .update({ revoked_at: nowIso })
        .eq("user_id", userId)
        .is("revoked_at", null);
    } catch {}

    // Consume/expire tokens (best effort)
    try {
      await supabaseAdmin
        .from("auth_tokens")
        .update({ consumed_at: nowIso })
        .eq("user_id", userId)
        .is("consumed_at", null);
    } catch {}

    // Delete user-generated content (best effort)
    try {
      await supabaseAdmin.from("messages").delete().eq("user_id", userId);
    } catch {}

    try {
      await supabaseAdmin.from("rewrite_usage").delete().eq("user_id", userId);
    } catch {}

    // Optional: audit (best effort)
    await audit("ACCOUNT_DELETED", userId, req, {
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
    });

    // Clear session cookie
    const res = jsonNoStore({
      ok: true,
      success: true,
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
      plan_type: userRow.plan_type ?? null,
    });

    const cookieDomain = getCookieDomain(req);

    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return res;
  } catch (err) {
    console.error("DELETE ACCOUNT ERROR:", err);
    return jsonNoStore({ error: "Server error while deleting account" }, { status: 500 });
  }
}