import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { generateToken, sha256Hex } from "@/lib/security/crypto";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { verifyAndroidPlayIntegrity } from "@/lib/security/play-integrity";
import { verifyIosAppAttestAssertion } from "@/lib/security/app-attest";
import { isReviewer } from "@/lib/auth/reviewers";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const ANDROID_CLIENT_HEADER = "android";
const ANDROID_PACKAGE_NAME = "com.tonemender.app";
const IOS_CLIENT_HEADER = "ios";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function shouldBypassInternalChecks(email: string) {
  return isReviewer(email);
}

function isAndroidClient(req: Request) {
  return req.headers.get("x-tonemender-client") === ANDROID_CLIENT_HEADER;
}

function isIosClient(req: Request) {
  return req.headers.get("x-tonemender-client") === IOS_CLIENT_HEADER;
}

function isValidEmail(email: string) {
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const emailRaw = body?.email;
    const password = body?.password;
    const captchaToken = body?.captchaToken;
    const integrityToken = body?.integrityToken;
    const integrityRequestHash = body?.integrityRequestHash;

    if (typeof emailRaw !== "string" || !emailRaw) {
      return jsonNoStore({ error: "Missing email" }, { status: 400 });
    }

    if (typeof password !== "string" || !password) {
      return jsonNoStore({ error: "Missing password" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    const ip = getClientIp(req) || "unknown";
    const shouldBypassInternal = shouldBypassInternalChecks(email);
    const androidClient = isAndroidClient(req);
    const iosClient = isIosClient(req);

    const ipAllowed = await rateLimitHit(`ip:${ip}:sign_up`, 60, 10);
    const emailAllowed = await rateLimitHit(`email:${email}:sign_up`, 300, 5);

    if (!ipAllowed || !emailAllowed) {
      await audit("SIGN_UP_RATE_LIMITED", null, req, { email, androidClient });
      return jsonNoStore({ error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    if (!isValidEmail(email)) {
      return jsonNoStore({ error: "Invalid email" }, { status: 400 });
    }

    if (password.length < 8) {
      return jsonNoStore({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    if (password.length > 200) {
      return jsonNoStore({ error: "Password is too long" }, { status: 400 });
    }

    if (!shouldBypassInternal) {
  if (androidClient) {
    if (typeof integrityToken !== "string" || !integrityToken) {
      return jsonNoStore({ error: "Integrity verification required" }, { status: 400 });
    }

    if (typeof integrityRequestHash !== "string" || !integrityRequestHash) {
      return jsonNoStore({ error: "Integrity request hash required" }, { status: 400 });
    }

    const integrity = await verifyAndroidPlayIntegrity({
      integrityToken,
      expectedPackageName: ANDROID_PACKAGE_NAME,
      expectedRequestHash: integrityRequestHash,
    });

    if (!integrity.ok) {
      await audit("SIGN_UP_INTEGRITY_FAILED", null, req, {
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
    const keyId = req.headers.get("x-tonemender-app-attest-key-id");
    const assertion = req.headers.get("x-tonemender-app-attest-assertion");
    const challenge = req.headers.get("x-tonemender-app-attest-challenge");
    const requestHash = req.headers.get("x-tonemender-request-hash");

    if (!keyId || !assertion || !challenge || !requestHash) {
      return jsonNoStore({ error: "Integrity verification required" }, { status: 400 });
    }

    const integrity = await verifyIosAppAttestAssertion({
      keyId,
      assertion,
      challenge,
      requestHash,
    });

    if (!integrity.ok) {
      await audit("SIGN_UP_IOS_APP_ATTEST_FAILED", null, req, {
        email,
        reason: integrity.reason,
      });

      return jsonNoStore(
        {
          error: integrity.publicMessage,
          reason: integrity.reason,
        },
        { status: 403 }
      );
    }
  } else {
    if (typeof captchaToken !== "string" || !captchaToken) {
      return jsonNoStore({ error: "Captcha verification required" }, { status: 400 });
    }

    const okCaptcha = await verifyTurnstile(captchaToken, getClientIp(req));
    if (!okCaptcha) {
      await audit("SIGN_UP_CAPTCHA_FAILED", null, req, { email });
      return jsonNoStore({ error: "Captcha verification failed" }, { status: 403 });
    }
  }
}

    const { data: existing, error: existErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existErr) {
      console.error("SIGN UP: exist check error:", existErr);
      return jsonNoStore({ error: "Server error" }, { status: 500 });
    }

    if (existing) {
      return jsonNoStore({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error: insertErr } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        email_verified_at: shouldBypassInternal ? new Date().toISOString() : null,
      })
      .select("id,email")
      .single();

    if (insertErr || !user?.id) {
      console.error("SIGN UP: user insert error:", insertErr);
      return jsonNoStore({ error: "Sign up failed" }, { status: 400 });
    }

    const userId = String(user.id);

    if (!shouldBypassInternal) {
      try {
        await supabaseAdmin
          .from("auth_tokens")
          .delete()
          .eq("user_id", userId)
          .eq("purpose", "email_verify")
          .is("consumed_at", null);
      } catch {}

      const rawToken = generateToken(32);
      const tokenHash = sha256Hex(rawToken);
      const expiresAtIso = new Date(Date.now() + 1000 * 60 * 60).toISOString();

      const { error: tokenErr } = await supabaseAdmin.from("auth_tokens").insert({
        user_id: userId,
        email,
        token_hash: tokenHash,
        purpose: "email_verify",
        expires_at: expiresAtIso,
        created_ip: getClientIp(req),
        created_ua: getUserAgent(req),
        data: {},
      });

      if (tokenErr) {
        console.error("SIGN UP: token insert error:", tokenErr);

        try {
          await supabaseAdmin.from("users").delete().eq("id", userId);
        } catch (rollbackErr) {
          console.error("SIGN UP: rollback delete user failed:", rollbackErr);
        }

        return jsonNoStore({ error: "Could not create verification link" }, { status: 500 });
      }

      const appUrl = process.env.APP_URL;
      if (!appUrl) {
        console.error("SIGN UP: Missing APP_URL");
        return jsonNoStore({ error: "Server error" }, { status: 500 });
      }

      const confirmUrl = `${appUrl}/confirm?type=email-verify&token=${encodeURIComponent(rawToken)}`;

      try {
        await sendEmail({
          to: email,
          subject: "Confirm your ToneMender email",
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.4">
              <h2>Confirm your email</h2>
              <p>Tap to confirm your email and activate your ToneMender account:</p>
              <p>
                <a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">
                  Confirm email
                </a>
              </p>
              <p style="color:#666;font-size:12px">This link expires in 1 hour.</p>
              <p style="color:#666;font-size:12px">If you didn’t request this, you can ignore this email.</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error("SIGN UP: sendEmail failed:", emailErr);
        await audit("SIGN_UP_EMAIL_SEND_FAILED", userId, req, {});

        return jsonNoStore(
          {
            error:
              "Account created, but we couldn't send the confirmation email. Please try again or use “Resend confirmation.”",
          },
          { status: 502 }
        );
      }
    }

    await audit("SIGN_UP_CREATED", userId, req, {
      email,
      bypassed_internal_checks: shouldBypassInternal,
      androidClient,
    });

    return jsonNoStore({ success: true });
  } catch (e: any) {
    console.error("SIGN UP ERROR:", e);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}