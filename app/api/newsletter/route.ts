import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { generateToken, sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

type NewsletterBody = {
  email?: unknown;
};

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

async function isRateLimitAllowed(key: string, windowSeconds: number, limit: number) {
  try {
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
      return !insErr;
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
  } catch {
    return true;
  }
}

export async function POST(req: Request) {
  try {
    let body: NewsletterBody = {};
    try {
      body = (await req.json()) as NewsletterBody;
    } catch {
      return jsonNoStore({ error: "Invalid request body" }, { status: 400 });
    }

    const emailRaw = body.email;

    if (typeof emailRaw !== "string" || !emailRaw) {
      return jsonNoStore({ error: "Valid email is required" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) {
      return jsonNoStore({ error: "Valid email is required" }, { status: 400 });
    }

    const ip = getClientIp(req) || "unknown";

    const ipAllowed = await isRateLimitAllowed(`ip:${ip}:newsletter`, 60, 10);
    const emailAllowed = await isRateLimitAllowed(`email:${email}:newsletter`, 300, 3);

    if (!ipAllowed || !emailAllowed) {
      return jsonNoStore({ error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return jsonNoStore({ error: "Server error" }, { status: 500 });
    }

    const { data: existingSubscriber, error: existingErr } = await supabaseAdmin
      .from("newsletter_subscribers")
      .select("email,confirmed,confirmed_at")
      .eq("email", email)
      .maybeSingle();

    if (existingErr) {
      console.error("NEWSLETTER existing subscriber lookup error:", existingErr);
      return jsonNoStore({ error: "Failed to save subscription" }, { status: 500 });
    }

    if (!existingSubscriber) {
      const { error: insertErr } = await supabaseAdmin
        .from("newsletter_subscribers")
        .insert({
          email,
          confirm_token_hash: null,
          confirmed: false,
          confirmed_at: null,
        });

      if (insertErr) {
        console.error("NEWSLETTER insert error:", insertErr);
        return jsonNoStore({ error: "Failed to save subscription" }, { status: 500 });
      }
    }

    try {
      await supabaseAdmin
        .from("auth_tokens")
        .delete()
        .eq("email", email)
        .eq("purpose", "newsletter_confirm")
        .is("consumed_at", null);
    } catch {}

    const rawToken = generateToken(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAtIso = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const { error: tokErr } = await supabaseAdmin.from("auth_tokens").insert({
      email,
      user_id: null,
      token_hash: tokenHash,
      purpose: "newsletter_confirm",
      expires_at: expiresAtIso,
      consumed_at: null,
      created_ip: getClientIp(req),
      created_ua: getUserAgent(req),
      data: {},
    });

    if (tokErr) {
      console.error("NEWSLETTER token insert error:", tokErr);
      return jsonNoStore({ error: "Failed to create confirmation link" }, { status: 500 });
    }

    const confirmUrl = `${appUrl}/confirm?type=newsletter&token=${encodeURIComponent(rawToken)}`;

    try {
      await sendEmail({
        to: email,
        subject: "Confirm your ToneMender newsletter subscription",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.4">
            <p>Thanks for subscribing to the ToneMender newsletter!</p>
            <p>Click the button below to confirm your subscription:</p>
            <p>
              <a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">
                Confirm subscription
              </a>
            </p>
            <p style="color:#6b7280;font-size:12px">
              If the button doesn’t work, copy and paste this link:<br/>
              <span>${confirmUrl}</span>
            </p>
            <p style="color:#666;font-size:12px">This link expires in 1 hour.</p>
            <p>If you didn’t request this, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch (err) {
      console.error("NEWSLETTER sendEmail error:", err);

      try {
        await supabaseAdmin
          .from("auth_tokens")
          .delete()
          .eq("token_hash", tokenHash)
          .eq("purpose", "newsletter_confirm")
          .is("consumed_at", null);
      } catch {}

      return jsonNoStore({ error: "Failed to send confirmation email" }, { status: 500 });
    }

    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("NEWSLETTER error:", err);
    return jsonNoStore({ error: "Internal server error" }, { status: 500 });
  }
}