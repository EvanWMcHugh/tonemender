// app/api/sign-up/route.ts
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

// Lightweight email sanity check (not RFC-perfect, but blocks obvious junk)
function isValidEmail(email: string) {
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

// Keep consistent with your app-wide bypass pattern
const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const emailRaw = body?.email;
    const password = body?.password;
    const captchaToken = body?.captchaToken;

    if (typeof emailRaw !== "string" || !emailRaw) {
      return jsonNoStore({ error: "Missing email" }, { status: 400 });
    }
    if (typeof password !== "string" || !password) {
      return jsonNoStore({ error: "Missing password" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    if (!isValidEmail(email)) {
      return jsonNoStore({ error: "Invalid email" }, { status: 400 });
    }

    if (password.length < 8) {
      return jsonNoStore(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (password.length > 200) {
      return jsonNoStore({ error: "Password is too long" }, { status: 400 });
    }

    // CAPTCHA (bypass for internal emails only)
    const shouldBypassCaptcha = CAPTCHA_BYPASS_EMAILS.has(email);

    if (!shouldBypassCaptcha) {
      if (typeof captchaToken !== "string" || !captchaToken) {
        return jsonNoStore(
          { error: "Captcha verification required" },
          { status: 400 }
        );
      }

      const okCaptcha = await verifyTurnstile(captchaToken, getClientIp(req));
      if (!okCaptcha) {
        return jsonNoStore({ error: "Captcha verification failed" }, { status: 403 });
      }
    }

    // Check if user exists
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

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);

    const { error: insertErr } = await supabaseAdmin.from("users").insert({
      email,
      password_hash: passwordHash,
      email_verified_at: null,
    });

    if (insertErr) {
      console.error("SIGN UP: user insert error:", insertErr);
      return jsonNoStore({ error: "Sign up failed" }, { status: 400 });
    }

    // Fetch created user
    const { data: user, error: fetchErr } = await supabaseAdmin
      .from("users")
      .select("id,email")
      .eq("email", email)
      .single();

    if (fetchErr || !user) {
      console.error("SIGN UP: user fetch error:", fetchErr);
      return jsonNoStore(
        { error: "Sign up failed (user created but could not be fetched)" },
        { status: 500 }
      );
    }

    // Delete any previous unconsumed verification token(s) (best effort)
    {
      const { error: delTokErr } = await supabaseAdmin
        .from("email_verification_tokens")
        .delete()
        .eq("user_id", user.id)
        .is("consumed_at", null);

      if (delTokErr) {
        // Not fatal; just log
        console.warn("SIGN UP: could not delete old verification tokens:", delTokErr);
      }
    }

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
      console.error("SIGN UP: token insert error:", tokenErr);

      // Best effort rollback (so you don't create a user who can't verify)
      try {
        await supabaseAdmin.from("users").delete().eq("id", user.id);
      } catch (rollbackErr) {
        console.error("SIGN UP: rollback delete user failed:", rollbackErr);
      }

      return jsonNoStore(
        { error: "Could not create verification link" },
        { status: 500 }
      );
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.error("SIGN UP: Missing APP_URL");
      return jsonNoStore({ error: "Server error" }, { status: 500 });
    }

    const confirmUrl = `${appUrl}/confirm?type=signup&token=${encodeURIComponent(
      rawToken
    )}`;

    // Email send failure: user + token exist; user can resend confirmation.
    try {
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
    } catch (emailErr) {
      console.error("SIGN UP: sendEmail failed:", emailErr);
      return jsonNoStore(
        {
          error:
            "Account created, but we couldn't send the confirmation email. Please try again or use “Resend confirmation.”",
        },
        { status: 502 }
      );
    }

    return jsonNoStore({ success: true });
  } catch (e: any) {
    console.error("SIGN UP ERROR:", e);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}