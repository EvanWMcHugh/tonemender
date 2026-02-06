// app/api/auth/request-password-reset/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateToken, sha256Hex } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

// ✅ Only these are excluded from captcha (match your sign-in page)
const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// We never want to reveal whether an email exists.
// Always return { ok: true } unless captcha is missing/invalid.
export async function POST(req: Request) {
  try {
    // Parse body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const emailRaw = body?.email;
    const turnstileToken = body?.turnstileToken;

    // ✅ Always OK (don’t leak)
    if (!emailRaw || typeof emailRaw !== "string") return jsonNoStore({ ok: true });

    const email = normalizeEmail(emailRaw);
    const isBypassEmail = CAPTCHA_BYPASS_EMAILS.has(email);

    // ✅ Enforce captcha unless bypass email
    if (!isBypassEmail) {
      if (!turnstileToken || typeof turnstileToken !== "string") {
        return jsonNoStore({ error: "Missing captcha" }, { status: 400 });
      }

      const okCaptcha = await verifyTurnstile(
        turnstileToken,
        req.headers.get("x-forwarded-for")
      );

      if (!okCaptcha) {
        return jsonNoStore({ error: "Captcha failed" }, { status: 400 });
      }
    }

    // ✅ Look up user by email using admin listUsers (types may lag; cast to any)
    const { data: usersData, error: usersErr } = await (supabaseAdmin.auth.admin as any).listUsers({
      page: 1,
      perPage: 1,
      filter: `email=eq.${email}`,
    });

    // If lookup fails, still don't leak
    if (usersErr) return jsonNoStore({ ok: true });

    const user = usersData?.users?.[0];
    if (!user) return jsonNoStore({ ok: true });

    // ✅ Keep only one valid reset link at a time
    await supabaseAdmin
      .from("password_reset_tokens")
      .delete()
      .eq("user_id", user.id)
      .is("used_at", null);

    // ✅ Create token (store hash only)
    const raw = generateToken(32);
    const tokenHash = sha256Hex(raw);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    const { error: insErr } = await supabaseAdmin.from("password_reset_tokens").insert({
      user_id: user.id,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });

    // If insert fails, still don't leak
    if (insErr) return jsonNoStore({ ok: true });

    const appUrl = process.env.APP_URL || "https://tonemender.com";
    const resetUrl = `${appUrl}/reset-password?token=${raw}`;

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

    return jsonNoStore({ ok: true });
  } catch {
    // ✅ Still don't leak
    return jsonNoStore({ ok: true });
  }
}