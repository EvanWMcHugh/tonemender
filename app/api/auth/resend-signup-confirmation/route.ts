import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { makeToken, sha256 } from "@/lib/authTokens";

export const runtime = "nodejs";

const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function verifyTurnstile(email: string, token: string) {
  if (CAPTCHA_BYPASS_EMAILS.has(email)) return;

  if (!token || token === "bypass") throw new Error("Captcha required");

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
    const turnstileToken: string = body?.turnstileToken ?? "";

    // Always return ok to avoid leaks
    if (!email) return NextResponse.json({ ok: true });

    await verifyTurnstile(email, turnstileToken);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,email_verified")
      .eq("email", email)
      .maybeSingle();

    // Don’t leak
    if (!profile) return NextResponse.json({ ok: true });
    if (profile.email_verified) return NextResponse.json({ ok: true });

    const token = makeToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

    await supabaseAdmin.from("signup_confirm_tokens").insert({
      user_id: profile.id,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

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
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Avoid leaks, but surface true server misconfig
    const msg = String(e?.message ?? "");
    if (msg.includes("Missing APP_URL") || msg.includes("TURNSTILE_SECRET_KEY")) {
      return NextResponse.json({ error: msg || "Server error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
}