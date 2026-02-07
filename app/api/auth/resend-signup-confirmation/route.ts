import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { generateToken, sha256Hex } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

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
    const turnstileToken = body?.turnstileToken;

    // Always return ok to avoid leaks
    if (!emailRaw || typeof emailRaw !== "string") return jsonNoStore({ ok: true });

    const email = normalizeEmail(emailRaw);
    if (!email) return jsonNoStore({ ok: true });

    // ✅ Enforce captcha unless bypass email
    if (!CAPTCHA_BYPASS_EMAILS.has(email)) {
      if (!turnstileToken || typeof turnstileToken !== "string") {
        return jsonNoStore({ error: "Missing captcha" }, { status: 400 });
      }

      const okCaptcha = await verifyTurnstile(turnstileToken, getClientIp(req));
      if (!okCaptcha) {
        return jsonNoStore({ error: "Captcha failed" }, { status: 400 });
      }
    }

    // ✅ Lookup user in your custom users table
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email_verified_at")
      .eq("email", email)
      .maybeSingle();

    // Don’t leak
    if (userErr || !user) return jsonNoStore({ ok: true });

    // Already verified -> nothing to do
    if (user.email_verified_at) return jsonNoStore({ ok: true });

    // ✅ Keep only one valid signup confirmation token at a time
    try {
      await supabaseAdmin
        .from("email_verification_tokens")
        .delete()
        .eq("user_id", user.id)
        .is("consumed_at", null);
    } catch {}

    const token = generateToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAtIso = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

    const { error: insErr } = await supabaseAdmin.from("email_verification_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAtIso,
      consumed_at: null,
    });

    // Don’t leak
    if (insErr) return jsonNoStore({ ok: true });

    const appUrl = process.env.APP_URL;
    if (!appUrl) return jsonNoStore({ error: "Missing APP_URL" }, { status: 500 });

    // ✅ Match your confirm route (POST /api/auth/confirm-signup) called by your /confirm page flow
    // If you have a dedicated page, keep the same destination as your app expects.
    const confirmUrl = `${appUrl}/confirm?type=signup&token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: email,
      subject: "Confirm your ToneMender account",
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

    return jsonNoStore({ ok: true });
  } catch (e: any) {
    console.error("RESEND SIGNUP CONFIRMATION ERROR:", e);

    // Avoid leaks, but surface true server misconfig
    const msg = String(e?.message ?? "");
    if (msg.includes("Missing APP_URL") || msg.includes("TURNSTILE_SECRET_KEY")) {
      return jsonNoStore({ error: msg || "Server error" }, { status: 500 });
    }

    return jsonNoStore({ ok: true });
  }
}