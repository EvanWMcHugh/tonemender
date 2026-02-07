// app/api/auth/request-email-change/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateToken, sha256Hex } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

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

async function getUserIdFromSession(req: Request) {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;

  const hash = sha256Hex(raw);

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (error || !session) return null;

  const exp = new Date(session.expires_at).getTime();
  if (Number.isNaN(exp) || exp < Date.now()) {
    try {
      await supabaseAdmin.from("sessions").delete().eq("session_token_hash", hash);
    } catch {}
    return null;
  }

  return session.user_id as string;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const newEmailRaw = body?.newEmail;
    const turnstileToken = body?.turnstileToken;

    if (!newEmailRaw || typeof newEmailRaw !== "string") {
      return jsonNoStore({ error: "Missing newEmail" }, { status: 400 });
    }
    if (!turnstileToken || typeof turnstileToken !== "string") {
      return jsonNoStore({ error: "Missing captcha" }, { status: 400 });
    }

    // ✅ Auth via cookie session
    const userId = await getUserIdFromSession(req);
    if (!userId) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Email validation
    const nextEmail = normalizeEmail(newEmailRaw);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(nextEmail)) {
      return jsonNoStore({ error: "Invalid email" }, { status: 400 });
    }

    // ✅ Turnstile verification (helper should support "bypass" for your internal emails)
    const okCaptcha = await verifyTurnstile(turnstileToken, getClientIp(req));
    if (!okCaptcha) {
      return jsonNoStore({ error: "Captcha failed" }, { status: 400 });
    }

    // Load current email from your users table
    const { data: me, error: meErr } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (meErr || !me?.email) {
      return jsonNoStore({ error: "User email missing" }, { status: 400 });
    }

    const oldEmail = normalizeEmail(me.email);

    if (oldEmail === nextEmail) {
      return jsonNoStore({ error: "New email must be different" }, { status: 400 });
    }

    // ✅ Prevent changing to an email already used by another user
    // Prefer exact match if you store normalized lowercase emails.
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

    // ✅ Delete any previous pending requests (avoids multiple valid links)
    try {
      await supabaseAdmin
        .from("email_change_requests")
        .delete()
        .eq("user_id", userId)
        .is("confirmed_at", null);
    } catch {}

    // ✅ Create verification token (store hash only)
    const raw = generateToken(32);
    const tokenHash = sha256Hex(raw);
    const expiresAtIso = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 minutes

    // ✅ Store request
    const { error: insErr } = await supabaseAdmin.from("email_change_requests").insert({
      user_id: userId,
      old_email: oldEmail,
      new_email: nextEmail,
      token_hash: tokenHash,
      expires_at: expiresAtIso,
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

    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("REQUEST EMAIL CHANGE ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}