import { jsonNoStore, notFound } from "@/lib/api/responses";
import { getSessionCookie } from "@/lib/auth/cookies";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp } from "@/lib/request/client-meta";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

const DEBUG_KEY = process.env.DEBUG_KEY || "";
const ENABLE_DEBUG_ROUTES = process.env.ENABLE_DEBUG_ROUTES === "true";
const DEBUG_IP_ALLOWLIST = (process.env.DEBUG_IP_ALLOWLIST || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

function deny() {
  return notFound("Not found");
}

function hasValidDebugKey(req: Request): boolean {
  if (!DEBUG_KEY) return true;

  const key = req.headers.get("x-debug-key") || "";
  return key === DEBUG_KEY;
}

function isIpAllowed(req: Request): boolean {
  if (DEBUG_IP_ALLOWLIST.length === 0) return true;

  const ip = getClientIp(req);
  if (!ip) return false;

  return DEBUG_IP_ALLOWLIST.includes(ip);
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;

  const timestamp = new Date(expiresAt).getTime();
  return Number.isNaN(timestamp) || timestamp <= Date.now();
}

export async function GET(req: Request) {
  if (!isDev() || !ENABLE_DEBUG_ROUTES) return deny();
  if (!hasValidDebugKey(req)) return deny();
  if (!isIpAllowed(req)) return deny();

  const rawSessionToken = getSessionCookie(req);
  const sessionExists = Boolean(rawSessionToken);

  if (!rawSessionToken) {
    return jsonNoStore({
      ok: true,
      env: "development",
      sessionExists,
      status: "no-cookie",
      session: null,
      user: null,
    });
  }

  const sessionTokenHash = sha256Hex(rawSessionToken);

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("id,user_id,expires_at,last_seen_at,revoked_at,ip,user_agent,device_name")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionError || !session?.user_id) {
    return jsonNoStore({
      ok: true,
      env: "development",
      sessionExists,
      status: "missing-session",
      session: null,
      user: null,
    });
  }

  if (session.revoked_at) {
    return jsonNoStore({
      ok: true,
      env: "development",
      sessionExists,
      status: "revoked",
      session,
      user: null,
    });
  }

  if (isExpired(session.expires_at)) {
    const { error: deleteError } = await supabaseAdmin
      .from("sessions")
      .delete()
      .eq("id", session.id);

    if (deleteError) {
      console.warn("DEBUG_SESSION_EXPIRED_DELETE_FAILED", {
        message: deleteError.message,
      });
    }

    return jsonNoStore({
      ok: true,
      env: "development",
      sessionExists,
      status: "expired",
      session,
      user: null,
    });
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id,email,is_pro,plan_type,disabled_at,deleted_at,last_login_at")
    .eq("id", session.user_id)
    .maybeSingle();

  const { error: updateError } = await supabaseAdmin
    .from("sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id);

  if (updateError) {
    console.warn("DEBUG_SESSION_LAST_SEEN_UPDATE_FAILED", {
      message: updateError.message,
    });
  }

  if (userError) {
    console.warn("DEBUG_SESSION_USER_LOOKUP_FAILED", {
      message: userError.message,
    });
  }

  return jsonNoStore({
    ok: true,
    env: "development",
    sessionExists,
    status: user?.id ? "active" : "user-missing",
    session,
    user: user
      ? {
          id: user.id,
          email: user.email,
          isPro: user.is_pro,
          planType: user.plan_type,
          disabledAt: user.disabled_at,
          deletedAt: user.deleted_at,
          lastLoginAt: user.last_login_at,
        }
      : null,
  });
}