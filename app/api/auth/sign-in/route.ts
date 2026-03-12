import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sha256Hex } from "@/lib/security/crypto";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { verifyAndroidPlayIntegrity } from "@/lib/security/play-integrity";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";
const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);
const ANDROID_CLIENT_HEADER = "android";
const ANDROID_PACKAGE_NAME = "com.tonemender.app";

function jsonNoStore(data: unknown, init?: ResponseInit) {
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
    const { error: insertError } = await supabaseAdmin.from("rate_limits").insert({
      key,
      window_start: windowStartIso,
      window_seconds: windowSeconds,
      count: 1,
    });

    if (insertError) return true;
    return true;
  }

  const nextCount = (row.count ?? 0) + 1;

  const { error: updateError } = await supabaseAdmin
    .from("rate_limits")
    .update({ count: nextCount })
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds);

  if (updateError) return true;
  return nextCount <= limit;
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;
    const password = body?.password;
    const captchaToken = body?.captchaToken;
    const integrityToken = body?.integrityToken;
    const integrityRequestHash = body?.integrityRequestHash;
    const deviceName = body?.deviceName;

    if (!emailRaw || typeof emailRaw !== "string") {
      return jsonNoStore({ error: "Missing email" }, { status: 400 });
    }

    if (!password || typeof password !== "string") {
      return jsonNoStore({ error: "Missing password" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);

    const ipAllowed = await rateLimitHit(`ip:${ip}:sign_in`, 60, 20);
    const emailAllowed = await rateLimitHit(`email:${email}:sign_in`, 300, 10);

    if (!ipAllowed || !emailAllowed) {
      await audit("SIGN_IN_RATE_LIMITED", null, req, { email, androidClient });
      return jsonNoStore({ error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    const bypassCaptcha = CAPTCHA_BYPASS_EMAILS.has(email);

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
        await audit("SIGN_IN_INTEGRITY_FAILED", null, req, {
          email,
          reason: integrity.reason,
          payload: integrity.payload ?? null,
        });

        return jsonNoStore(
          {
            error: integrity.publicMessage,
            reason: integrity.reason,
            payload: process.env.NODE_ENV === "development" ? integrity.payload ?? null : undefined,
          },
          { status: 403 }
        );
      }
    } else if (!bypassCaptcha) {
      if (!captchaToken || typeof captchaToken !== "string") {
        return jsonNoStore({ error: "Captcha verification required" }, { status: 400 });
      }

      const captchaOk = await verifyTurnstile(captchaToken, getClientIp(req));
      if (!captchaOk) {
        await audit("SIGN_IN_CAPTCHA_FAILED", null, req, { email });
        return jsonNoStore({ error: "Captcha verification failed" }, { status: 403 });
      }
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id,email,password_hash,email_verified_at,is_pro,plan_type,disabled_at,deleted_at")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      return jsonNoStore({ error: "Server error" }, { status: 500 });
    }

    if (!user) {
      await audit("SIGN_IN_BAD_CREDENTIALS", null, req, { email, androidClient });
      return jsonNoStore({ error: "Invalid email or password" }, { status: 401 });
    }

    if (user.disabled_at || user.deleted_at) {
      await audit("SIGN_IN_BLOCKED_ACCOUNT", String(user.id), req, { androidClient });
      return jsonNoStore({ error: "Account unavailable" }, { status: 403 });
    }

    if (!user.email_verified_at) {
      await audit("SIGN_IN_UNVERIFIED", String(user.id), req, { androidClient });
      return jsonNoStore({ error: "Email not confirmed" }, { status: 403 });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      await audit("SIGN_IN_BAD_CREDENTIALS", String(user.id), req, { androidClient });
      return jsonNoStore({ error: "Invalid email or password" }, { status: 401 });
    }

    const rawSessionToken = cryptoRandomHex(32);
    const sessionTokenHash = sha256Hex(rawSessionToken);

    const maxAgeSeconds = 60 * 60 * 24 * 30;
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();

    const { error: sessionError } = await supabaseAdmin.from("sessions").insert({
      user_id: user.id,
      session_token_hash: sessionTokenHash,
      expires_at: expiresAt,
      last_seen_at: nowIso,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      device_name: typeof deviceName === "string" ? deviceName.slice(0, 200) : null,
    });

    if (sessionError) {
      return jsonNoStore({ error: "Failed to create session" }, { status: 500 });
    }

    try {
      await supabaseAdmin.from("users").update({ last_login_at: nowIso }).eq("id", user.id);
    } catch {}

    await audit("SIGN_IN_OK", String(user.id), req, { androidClient });

    const res = jsonNoStore({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        isPro: user.is_pro,
        planType: user.plan_type,
      },
    });

    const cookieDomain = androidClient ? undefined : getCookieDomain(req);

res.cookies.set(SESSION_COOKIE, rawSessionToken, {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSeconds,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
});

    return res;
  } catch {
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}