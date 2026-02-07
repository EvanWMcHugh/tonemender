import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { generateToken, sha256Hex } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;
    const password = body?.password;
    const captchaToken = body?.captchaToken;

    if (!emailRaw || typeof emailRaw !== "string") {
      return jsonNoStore({ error: "Missing email" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return jsonNoStore({ error: "Missing password" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    if (password.length < 8) {
      return jsonNoStore(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (password.length > 200) {
      return jsonNoStore({ error: "Password is too long" }, { status: 400 });
    }

    if (!captchaToken || typeof captchaToken !== "string") {
      return jsonNoStore(
        { error: "Captcha verification required" },
        { status: 400 }
      );
    }

    const okCaptcha = await verifyTurnstile(captchaToken, getClientIp(req));
    if (!okCaptcha) {
      return jsonNoStore({ error: "Captcha verification failed" }, { status: 403 });
    }

    // Check if user exists
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existErr) return jsonNoStore({ error: "Server error" }, { status: 500 });
    if (existing) return jsonNoStore({ error: "Email already in use" }, { status: 409 });

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        email_verified_at: null,
      })
      .select("id,email")
      .single();

    if (userErr || !user) {
      return jsonNoStore({ error: "Sign up failed" }, { status: 400 });
    }

    // Delete any previous unconsumed verification token(s)
    try {
      await supabaseAdmin
        .from("email_verification_tokens")
        .delete()
        .eq("user_id", user.id)
        .is("consumed_at", null);
    } catch {}

    // Create verification token (store hash only)
    const rawToken = generateToken(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAtIso = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

    const { error: tokenErr } = await supabaseAdmin
      .from("email_verification_tokens")
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAtIso,
        consumed_at: null,
      });

    if (tokenErr) {
      // Best effort rollback
      try {
        await supabaseAdmin.from("users").delete().eq("id", user.id);
      } catch {}
      return jsonNoStore(
        { error: "Could not create verification link" },
        { status: 500 }
      );
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) return jsonNoStore({ error: "Missing APP_URL" }, { status: 500 });

    const confirmUrl = `${appUrl}/confirm?type=signup&token=${encodeURIComponent(
      rawToken
    )}`;

    await sendEmail({
      to: email,
      subject: "Confirm your ToneMender account",
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

    return jsonNoStore({ success: true });
  } catch (e: any) {
    console.error("SIGN UP ERROR:", e);
    return jsonNoStore({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
