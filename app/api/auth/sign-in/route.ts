import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import bcrypt from "bcryptjs";
import { sha256Hex } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";
import crypto from "crypto";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";
const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}

function cryptoRandomHex(bytes: number) {
  return crypto.randomBytes(bytes).toString("hex");
}

// Share cookie across tonemender.com + www.tonemender.com
function getCookieDomain(req: Request) {
  const host = req.headers.get("host") || "";
  if (host === "tonemender.com" || host === "www.tonemender.com" || host.endsWith(".tonemender.com")) {
    return ".tonemender.com";
  }
  return undefined;
}

// Simple DB rate limiter (fail-open)
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
    if (insErr) return true;
    return true;
  }

  const next = (row.count ?? 0) + 1;
  const { error: updErr } = await supabaseAdmin
    .from("rate_limits")
    .update({ count: next })
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds);

  if (updErr) return true;
  return next <= limit;
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;
    const password = body?.password;
    const captchaToken = body?.captchaToken;
    const deviceName = body?.deviceName; // optional

    if (!emailRaw || typeof emailRaw !== "string") {
      return jsonNoStore({ error: "Missing email" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return jsonNoStore({ error: "Missing password" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    const ip = getClientIp(req) || "unknown";

    // Rate limit BEFORE doing any expensive work (but don’t reveal existence)
    const ipAllowed = await rateLimitHit(`ip:${ip}:sign_in`, 60, 20);
    const emailAllowed = await rateLimitHit(`email:${email}:sign_in`, 300, 10);
    if (!ipAllowed || !emailAllowed) {
      await audit("SIGN_IN_RATE_LIMITED", null, req, { email });
      return jsonNoStore({ error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    // Turnstile (allow bypass emails if you want parity with other flows)
    const bypass = CAPTCHA_BYPASS_EMAILS.has(email);
    if (!bypass) {
      if (!captchaToken || typeof captchaToken !== "string") {
        return jsonNoStore({ error: "Captcha verification required" }, { status: 400 });
      }
      const okCaptcha = await verifyTurnstile(captchaToken, getClientIp(req));
      if (!okCaptcha) {
        await audit("SIGN_IN_CAPTCHA_FAILED", null, req, { email });
        return jsonNoStore({ error: "Captcha verification failed" }, { status: 403 });
      }
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id,email,password_hash,email_verified_at,is_pro,plan_type,disabled_at,deleted_at")
      .eq("email", email)
      .maybeSingle();

    if (error) return jsonNoStore({ error: "Server error" }, { status: 500 });
    if (!user) {
      await audit("SIGN_IN_BAD_CREDENTIALS", null, req, { email });
      return jsonNoStore({ error: "Invalid email or password" }, { status: 401 });
    }

    // Block disabled/deleted accounts
    if (user.disabled_at || user.deleted_at) {
      await audit("SIGN_IN_BLOCKED_ACCOUNT", String(user.id), req, {});
      return jsonNoStore({ error: "Account unavailable" }, { status: 403 });
    }

    if (!user.email_verified_at) {
      await audit("SIGN_IN_UNVERIFIED", String(user.id), req, {});
      return jsonNoStore({ error: "Email not confirmed" }, { status: 403 });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await audit("SIGN_IN_BAD_CREDENTIALS", String(user.id), req, {});
      return jsonNoStore({ error: "Invalid email or password" }, { status: 401 });
    }

    const rawSession = cryptoRandomHex(32);
    const sessionHash = sha256Hex(rawSession);

    const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 days
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();

    const { error: sErr } = await supabaseAdmin.from("sessions").insert({
      user_id: user.id,
      session_token_hash: sessionHash,
      expires_at: expiresAt,
      last_seen_at: nowIso,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      device_name: typeof deviceName === "string" ? deviceName.slice(0, 200) : null,
    });

    if (sErr) return jsonNoStore({ error: "Failed to create session" }, { status: 500 });

    // Update last_login_at (best effort)
    try {
      await supabaseAdmin.from("users").update({ last_login_at: nowIso }).eq("id", user.id);
    } catch {}

    await audit("SIGN_IN_OK", String(user.id), req, {});

    const res = jsonNoStore({
      ok: true,
      user: { id: user.id, email: user.email, isPro: user.is_pro, planType: user.plan_type },
    });

    const cookieDomain = getCookieDomain(req);

    res.cookies.set(SESSION_COOKIE, rawSession, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: maxAgeSeconds,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return res;
  } catch (e: any) {
    console.error("SIGN IN ERROR:", e);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}