import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { generateToken, sha256Hex } from "@/lib/security/crypto";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { verifyAndroidPlayIntegrity } from "@/lib/security/play-integrity";

export const runtime = "nodejs";

const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);
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
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;
    const turnstileToken = body?.turnstileToken;
    const integrityToken = body?.integrityToken;
    const integrityRequestHash = body?.integrityRequestHash;

    if (!emailRaw || typeof emailRaw !== "string") return jsonNoStore({ ok: true });

    const email = normalizeEmail(emailRaw);
    if (!email) return jsonNoStore({ ok: true });

    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);

    const ipAllowed = await rateLimitHit(`ip:${ip}:resend_verify`, 60, 10);
    const emailAllowed = await rateLimitHit(`email:${email}:resend_verify`, 300, 5);
    if (!ipAllowed || !emailAllowed) return jsonNoStore({ ok: true });

    if (!CAPTCHA_BYPASS_EMAILS.has(email)) {
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
          await audit("EMAIL_VERIFY_RESEND_INTEGRITY_FAILED", null, req, {
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
          return jsonNoStore({ error: "Captcha failed" }, { status: 400 });
        }
      }
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email_verified_at,disabled_at,deleted_at")
      .eq("email", email)
      .maybeSingle();

    if (userErr || !user?.id) return jsonNoStore({ ok: true });
    if (user.disabled_at || user.deleted_at) return jsonNoStore({ ok: true });
    if (user.email_verified_at) return jsonNoStore({ ok: true });

    const userId = String(user.id);

    try {
      await supabaseAdmin
        .from("auth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("purpose", "email_verify")
        .is("consumed_at", null);
    } catch {}

    const token = generateToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAtIso = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const { error: insErr } = await supabaseAdmin.from("auth_tokens").insert({
      user_id: userId,
      email,
      token_hash: tokenHash,
      purpose: "email_verify",
      expires_at: expiresAtIso,
      created_ip: getClientIp(req),
      created_ua: getUserAgent(req),
      data: {},
    });

    if (insErr) return jsonNoStore({ ok: true });

    const appUrl = process.env.APP_URL;
    if (!appUrl) return jsonNoStore({ error: "Missing APP_URL" }, { status: 500 });

    const confirmUrl = `${appUrl}/(auth)/confirm?type=email-verify&token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: email,
      subject: "Confirm your ToneMender email",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>Confirm your email</h2>
          <p>Tap below to confirm your email and activate your ToneMender account:</p>
          <p>
            <a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">
              Confirm email
            </a>
          </p>
          <p style="color:#666;font-size:12px">This link expires in 1 hour.</p>
        </div>
      `,
    });

    await audit("EMAIL_VERIFICATION_RESENT", userId, req, { androidClient });
    return jsonNoStore({ ok: true });
  } catch (e: any) {
    console.error("RESEND EMAIL VERIFICATION ERROR:", e);

    const msg = String(e?.message ?? "");
    if (msg.includes("Missing APP_URL") || msg.includes("TURNSTILE_SECRET_KEY")) {
      return jsonNoStore({ error: msg || "Server error" }, { status: 500 });
    }

    return jsonNoStore({ ok: true });
  }
}