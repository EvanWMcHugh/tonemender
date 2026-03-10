import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

/**
 * Optional hardening (recommended):
 * - Set DEBUG_KEY in .env.local, and the page will send it as x-debug-key.
 * - Set DEBUG_IP_ALLOWLIST as comma-separated list (optional).
 *
 * Example:
 * DEBUG_KEY=dev-super-secret
 * DEBUG_IP_ALLOWLIST=127.0.0.1,::1
 */
const DEBUG_KEY = process.env.DEBUG_KEY || "";
const DEBUG_IP_ALLOWLIST = (process.env.DEBUG_IP_ALLOWLIST || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

function isDev() {
  return process.env.NODE_ENV === "development";
}

function deny() {
  // 404 (not 401/403) = less discoverable
  return jsonNoStore({ error: "Not found" }, { status: 404 });
}

function requireDebugKey(req: Request) {
  if (!DEBUG_KEY) return true; // not enabled
  const k = req.headers.get("x-debug-key") || "";
  return k === DEBUG_KEY;
}

function requireIpAllowlist(req: Request) {
  if (DEBUG_IP_ALLOWLIST.length === 0) return true; // not enabled
  const ip = getClientIp(req);
  if (!ip) return false;
  return DEBUG_IP_ALLOWLIST.includes(ip);
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t <= Date.now();
}

export async function GET(req: Request) {
  // 🔒 Layer 1: env lock
  if (!isDev()) return deny();

  // 🔒 Layer 2: optional header secret
  if (!requireDebugKey(req)) return deny();

  // 🔒 Layer 3: optional IP allowlist
  if (!requireIpAllowlist(req)) return deny();

  const raw = readCookie(req, SESSION_COOKIE);
  const sessionExists = Boolean(raw);

  if (!raw) {
    return jsonNoStore({
      ok: true,
      env: "development",
      sessionExists,
      status: "no-cookie",
      session: null,
      user: null,
    });
  }

  const hash = sha256Hex(raw);

  // Pull session row
  const { data: session, error: sErr } = await supabaseAdmin
    .from("sessions")
    .select("id,user_id,expires_at,last_seen_at,revoked_at,ip,user_agent,device_name")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (sErr || !session?.user_id) {
    return jsonNoStore({
      ok: true,
      env: "development",
      sessionExists,
      status: "missing-session",
      session: null,
      user: null,
    });
  }

  // Validate session
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
    // Best-effort cleanup
    try {
      await supabaseAdmin.from("sessions").delete().eq("id", session.id);
    } catch {}

    return jsonNoStore({
      ok: true,
      env: "development",
      sessionExists,
      status: "expired",
      session: { ...session, expires_at: session.expires_at },
      user: null,
    });
  }

  // Load user
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id,email,is_pro,plan_type,disabled_at,deleted_at,last_login_at")
    .eq("id", session.user_id)
    .maybeSingle();

  // Best-effort last_seen update (helpful for debugging)
  try {
    await supabaseAdmin
      .from("sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", session.id);
  } catch {}

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