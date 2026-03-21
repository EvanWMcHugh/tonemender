import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { generateToken, sha256Hex } from "@/lib/security/crypto";
import { sendEmail } from "@/lib/email/sendEmail";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { verifyAndroidPlayIntegrity } from "@/lib/security/play-integrity";
import { verifyIosAppAttestAssertion } from "@/lib/security/app-attest";

export const runtime = "nodejs";

const ANDROID_CLIENT_HEADER = "android";
const ANDROID_PACKAGE_NAME =
  process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.tonemender.app";
const IOS_CLIENT_HEADER = "ios";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

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

function getClientPlatform(req: Request) {
  return (
    req.headers.get("x-client-platform") ??
    req.headers.get("x-tonemender-client")
  )?.trim().toLowerCase() ?? null;
}

function isAndroidClient(req: Request) {
  return getClientPlatform(req) === ANDROID_CLIENT_HEADER;
}

function isIosClient(req: Request) {
  return getClientPlatform(req) === IOS_CLIENT_HEADER;
}

async function isRateLimitAllowed(key: string, windowSeconds: number, limit: number) {
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

// Never reveal whether an email exists.
// Return { ok: true } unless the request itself is malformed or protection fails.
export async function POST(req: Request) {
  try {
    const rawText = await req.text();
    const rawBodyBuffer = Buffer.from(rawText, "utf8");
    let body: Record<string, unknown> = {};
try {
  body = rawText ? JSON.parse(rawText) : {};
} catch {
  return jsonNoStore({ ok: true });
}

    const emailRaw = body?.email;
    const turnstileToken = body?.turnstileToken;
    const integrityToken = body?.integrityToken;
    const integrityRequestHash = body?.integrityRequestHash;

    if (!emailRaw || typeof emailRaw !== "string") {
      return jsonNoStore({ ok: true });
    }

    const email = normalizeEmail(emailRaw);
    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);
    const iosClient = isIosClient(req);

    const ipAllowed = await isRateLimitAllowed(`ip:${ip}:pw_reset_request`, 60, 10);
    const emailAllowed = await isRateLimitAllowed(`email:${email}:pw_reset_request`, 300, 5);
    if (!ipAllowed || !emailAllowed) {
      return jsonNoStore({ ok: true });
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
        await audit("PASSWORD_RESET_INTEGRITY_FAILED", null, req, {
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
    } else if (iosClient) {
      const keyId = req.headers.get("x-app-attest-key-id");
      const assertion = req.headers.get("x-app-attest-assertion");
      const challengeId = req.headers.get("x-app-attest-challenge-id");

      if (!keyId || !assertion || !challengeId) {
        return jsonNoStore({ error: "Integrity verification required" }, { status: 400 });
      }

      const integrity = await verifyIosAppAttestAssertion({
        keyId,
        assertion,
        challengeId,
        method: "POST",
        path: "/api/auth/request-password-reset",
        requestBody: rawBodyBuffer,
      });

      if (!integrity.ok) {
        await audit("PASSWORD_RESET_IOS_APP_ATTEST_FAILED", null, req, {
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
    } else {
      if (!turnstileToken || typeof turnstileToken !== "string") {
        return jsonNoStore({ error: "Missing captcha" }, { status: 400 });
      }

      const okCaptcha = await verifyTurnstile(turnstileToken, getClientIp(req));
      if (!okCaptcha) {
        await audit("PASSWORD_RESET_CAPTCHA_FAILED", null, req, { email });
        return jsonNoStore({ error: "Captcha failed" }, { status: 400 });
      }
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email,disabled_at,deleted_at")
      .eq("email", email)
      .maybeSingle();

    if (userErr || !user?.id) return jsonNoStore({ ok: true });
    if (user.disabled_at || user.deleted_at) return jsonNoStore({ ok: true });

    const userId = String(user.id);

    try {
      await supabaseAdmin
        .from("auth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("purpose", "password_reset")
        .is("consumed_at", null);
    } catch {}

    const raw = generateToken(32);
    const tokenHash = sha256Hex(raw);
    const expiresAtIso = new Date(Date.now() + 1000 * 60 * 30).toISOString();

    const { error: insErr } = await supabaseAdmin.from("auth_tokens").insert({
      user_id: userId,
      email,
      token_hash: tokenHash,
      purpose: "password_reset",
      expires_at: expiresAtIso,
      created_ip: getClientIp(req),
      created_ua: getUserAgent(req),
      data: {},
    });

    if (insErr) return jsonNoStore({ ok: true });

    const appUrl = process.env.APP_URL;
if (!appUrl) return jsonNoStore({ error: "Missing APP_URL" }, { status: 500 });
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(raw)}`;

    await sendEmail({
      to: email,
      subject: "Reset your ToneMender password",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>Reset your password</h2>
          <p>Click below to set a new password.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">
              Reset password
            </a>
          </p>
          <p style="color:#6b7280;font-size:12px">
            If the button doesn’t work, copy and paste this link:<br/>
            <span>${resetUrl}</span>
          </p>
          <p>If you didn’t request this, ignore this email.</p>
          <p style="color:#666;font-size:12px">This link expires in 30 minutes.</p>
        </div>
      `,
    });

    await audit("PASSWORD_RESET_REQUESTED", userId, req, {
      androidClient,
      iosClient,
    });

    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("REQUEST PASSWORD RESET ERROR:", err);
    return jsonNoStore({ ok: true });
  }
}