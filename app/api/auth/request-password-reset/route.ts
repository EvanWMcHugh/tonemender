// app/api/auth/request-password-reset/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { generateToken, sha256Hex } from "@/lib/security/crypto";
import { sendEmail } from "@/lib/email/sendEmail";
import { verifyTurnstile } from "@/lib/security/turnstile";

export const runtime = "nodejs";

// Only these are excluded from captcha (match your sign-in page)
const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function jsonNoStore(data: any, init?: ResponseInit) {
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

// DB-backed rate limit helper (simple, fail-open)
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

// We never want to reveal whether an email exists.
// Always return { ok: true } unless captcha is missing/invalid.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;
    const turnstileToken = body?.turnstileToken;

    // Always OK (don’t leak)
    if (!emailRaw || typeof emailRaw !== "string") return jsonNoStore({ ok: true });

    const email = normalizeEmail(emailRaw);
    const ip = getClientIp(req) || "unknown";

    // Rate limit by IP and by email (don’t leak on rate limit either)
    // If rate-limited, we still return ok:true to avoid side channels.
    const ipAllowed = await rateLimitHit(`ip:${ip}:pw_reset_request`, 60, 10);
    const emailAllowed = await rateLimitHit(`email:${email}:pw_reset_request`, 300, 5);
    if (!ipAllowed || !emailAllowed) return jsonNoStore({ ok: true });

    const isBypassEmail = CAPTCHA_BYPASS_EMAILS.has(email);

    // Enforce captcha unless bypass email
    if (!isBypassEmail) {
      if (!turnstileToken || typeof turnstileToken !== "string") {
        // This one can be a hard error because it’s not an existence leak
        return jsonNoStore({ error: "Missing captcha" }, { status: 400 });
      }

      const okCaptcha = await verifyTurnstile(turnstileToken, getClientIp(req));
      if (!okCaptcha) {
        return jsonNoStore({ error: "Captcha failed" }, { status: 400 });
      }
    }

    // Look up user in your users table
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email,disabled_at,deleted_at")
      .eq("email", email)
      .maybeSingle();

    // Still don't leak
    if (userErr || !user?.id) return jsonNoStore({ ok: true });

    // Don’t issue reset links for disabled/deleted users (still don’t leak)
    if (user.disabled_at || user.deleted_at) return jsonNoStore({ ok: true });

    const userId = String(user.id);

    // Replace any previous unconsumed reset token (required due to unique partial index)
    try {
      await supabaseAdmin
        .from("auth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("purpose", "password_reset")
        .is("consumed_at", null);
    } catch {}

    // Create token (store hash only)
    const raw = generateToken(32);
    const tokenHash = sha256Hex(raw);
    const expiresAtIso = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 minutes

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

    // Still don't leak
    if (insErr) return jsonNoStore({ ok: true });

    const appUrl = process.env.APP_URL || "https://tonemender.com";
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

    await audit("PASSWORD_RESET_REQUESTED", userId, req, {});
    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("REQUEST PASSWORD RESET ERROR:", err);
    // Still don't leak
    return jsonNoStore({ ok: true });
  }
}