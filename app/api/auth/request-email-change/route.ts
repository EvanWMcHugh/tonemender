import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { generateToken, sha256Hex } from "@/lib/security/crypto";
import { sendEmail } from "@/lib/email/sendEmail";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { verifyAndroidPlayIntegrity } from "@/lib/security/play-integrity";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";
const ANDROID_CLIENT_HEADER = "android";
const ANDROID_PACKAGE_NAME = "com.tonemender.app";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

function isAndroidClient(req: Request) {
  return req.headers.get("x-tonemender-client") === ANDROID_CLIENT_HEADER;
}

async function rateLimitHit(key: string, windowSeconds: number, limit: number) {
  const now = Date.now();
  const windowStartSeconds = Math.floor(now / 1000 / windowSeconds) * windowSeconds;
  const windowStartIso = new Date(windowStartSeconds * 1000).toISOString();

  const { data: existing } = await supabaseAdmin
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds)
    .maybeSingle();

  if (!existing) {
    const { error: insErr } = await supabaseAdmin.from("rate_limits").insert({
      key,
      window_start: windowStartIso,
      window_seconds: windowSeconds,
      count: 1,
    });
    if (insErr) return true;
    return true;
  }

  const next = (existing.count ?? 0) + 1;
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

async function getUserFromSession(req: Request) {
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

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id,email,disabled_at,deleted_at")
    .eq("id", session.user_id)
    .maybeSingle();

  if (!user?.id || !user.email) return null;
  if (user.disabled_at || user.deleted_at) return null;

  try {
    await supabaseAdmin
      .from("sessions")
      .update({ last_seen_at: nowIso })
      .eq("session_token_hash", hash)
      .is("revoked_at", null);
  } catch {}

  return { id: user.id as string, email: String(user.email) };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const newEmailRaw = body?.newEmail;
    const turnstileToken = body?.turnstileToken;
    const integrityToken = body?.integrityToken;
    const integrityRequestHash = body?.integrityRequestHash;

    if (!newEmailRaw || typeof newEmailRaw !== "string") {
      return jsonNoStore({ error: "Missing newEmail" }, { status: 400 });
    }

    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);

    const ipAllowed = await rateLimitHit(`ip:${ip}:email_change_request`, 60, 10);
    if (!ipAllowed) {
      return jsonNoStore({ error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    const me = await getUserFromSession(req);
    if (!me) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = me.id;
    const oldEmail = normalizeEmail(me.email);

    const userAllowed = await rateLimitHit(`user:${userId}:email_change_request`, 300, 5);
    if (!userAllowed) {
      return jsonNoStore({ error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    const nextEmail = normalizeEmail(newEmailRaw);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRegex.test(nextEmail)) {
      return jsonNoStore({ error: "Invalid email" }, { status: 400 });
    }

    if (oldEmail === nextEmail) {
      return jsonNoStore({ error: "New email must be different" }, { status: 400 });
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
        await audit("EMAIL_CHANGE_REQUEST_INTEGRITY_FAILED", userId, req, {
          next_email: nextEmail,
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
    } else {
      if (!turnstileToken || typeof turnstileToken !== "string") {
        return jsonNoStore({ error: "Missing captcha" }, { status: 400 });
      }

      const okCaptcha = await verifyTurnstile(turnstileToken, getClientIp(req));
      if (!okCaptcha) {
        await audit("EMAIL_CHANGE_REQUEST_CAPTCHA_FAILED", userId, req, { next_email: nextEmail });
        return jsonNoStore({ error: "Captcha failed" }, { status: 400 });
      }
    }

    const { data: existing, error: existErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", nextEmail)
      .maybeSingle();

    if (existErr) {
      return jsonNoStore({ error: "Could not validate email" }, { status: 500 });
    }

    if (existing && existing.id !== userId) {
      return jsonNoStore({ error: "Unable to use that email address." }, { status: 400 });
    }

    try {
      await supabaseAdmin
        .from("auth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("purpose", "email_change")
        .is("consumed_at", null);
    } catch {}

    const raw = generateToken(32);
    const tokenHash = sha256Hex(raw);
    const expiresAtIso = new Date(Date.now() + 1000 * 60 * 30).toISOString();

    const { error: insErr } = await supabaseAdmin.from("auth_tokens").insert({
      user_id: userId,
      token_hash: tokenHash,
      purpose: "email_change",
      expires_at: expiresAtIso,
      created_ip: getClientIp(req),
      created_ua: getUserAgent(req),
      data: { new_email: nextEmail, old_email: oldEmail },
    });

    if (insErr) {
      return jsonNoStore({ error: "Could not create request" }, { status: 500 });
    }

    const appUrl = process.env.APP_URL || "https://tonemender.com";
    const confirmUrl = `${appUrl}/confirm?type=email-change&token=${encodeURIComponent(raw)}`;

    await sendEmail({
      to: nextEmail,
      subject: "Confirm your new ToneMender email",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>Confirm your new email</h2>
          <p>Click the button below to confirm this email for your ToneMender account.</p>
          <p>
            <a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">
              Confirm email
            </a>
          </p>
          <p>If you didn’t request this, you can ignore this email.</p>
          <p style="color:#666;font-size:12px">This link expires in 30 minutes.</p>
        </div>
      `,
    });

    await audit("EMAIL_CHANGE_REQUESTED", userId, req, { next_email: nextEmail, androidClient });
    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("REQUEST EMAIL CHANGE ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}