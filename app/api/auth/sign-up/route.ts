import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { makeToken, sha256 } from "@/lib/authTokens";

export const runtime = "nodejs";

const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function verifyTurnstile(email: string, token: string | null) {
  if (CAPTCHA_BYPASS_EMAILS.has(email)) return;

  if (!token) throw new Error("Captcha verification required");

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error("Missing TURNSTILE_SECRET_KEY");

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.success) throw new Error("Captcha verification failed");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body?.email ?? "");
    const password = body?.password ?? "";
    const captchaToken: string | null = body?.captchaToken ?? null;

    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    await verifyTurnstile(email, captchaToken);

    // ✅ Create Auth user (Supabase does NOT send email)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });

    if (error || !data?.user) {
      return NextResponse.json({ error: error?.message ?? "Sign up failed" }, { status: 400 });
    }

    const userId = data.user.id;

    // ✅ Ensure profile exists + mark unverified
    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      email_verified: false,
    });

    if (profileErr) {
      // fail-safe: don't leave an untracked state
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // ✅ Create confirmation token (hashed)
    const token = makeToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

    const { error: tokenErr } = await supabaseAdmin.from("signup_confirm_tokens").insert({
      user_id: userId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (tokenErr) {
      return NextResponse.json({ error: tokenErr.message }, { status: 500 });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) return NextResponse.json({ error: "Missing APP_URL" }, { status: 500 });

    const confirmUrl = `${appUrl}/confirm-signup?token=${token}`;

    await sendEmail({
      to: email,
      subject: "Confirm your ToneMender account",
      html: `
        <p>Tap to confirm your email and activate your ToneMender account:</p>
        <p><a href="${confirmUrl}">Confirm email</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn’t request this, you can ignore this email.</p>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}