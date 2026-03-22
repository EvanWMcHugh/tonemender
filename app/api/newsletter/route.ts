import {
  badRequest,
  jsonNoStore,
  serverError,
  tooManyRequests,
} from "@/lib/api/responses";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sendEmail } from "@/lib/email/send-email";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";
import { generateToken, sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

type NewsletterBody = {
  email?: unknown;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function isRateLimitAllowed(
  key: string,
  windowSeconds: number,
  limit: number
): Promise<boolean> {
  try {
    const now = Date.now();
    const windowStartSeconds =
      Math.floor(now / 1000 / windowSeconds) * windowSeconds;
    const windowStartIso = new Date(windowStartSeconds * 1000).toISOString();

    const { data: row } = await supabaseAdmin
      .from("rate_limits")
      .select("count")
      .eq("key", key)
      .eq("window_start", windowStartIso)
      .eq("window_seconds", windowSeconds)
      .maybeSingle();

    if (!row) {
      const { error } = await supabaseAdmin.from("rate_limits").insert({
        key,
        window_start: windowStartIso,
        window_seconds: windowSeconds,
        count: 1,
      });

      return !error;
    }

    const next = (row.count ?? 0) + 1;

    const { error } = await supabaseAdmin
      .from("rate_limits")
      .update({ count: next })
      .eq("key", key)
      .eq("window_start", windowStartIso)
      .eq("window_seconds", windowSeconds);

    if (error) return true;

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
      return badRequest("Invalid request body");
    }

    const emailRaw = body.email;

    if (typeof emailRaw !== "string" || !emailRaw.trim()) {
      return badRequest("Valid email is required");
    }

    const email = normalizeEmail(emailRaw);

    if (!isValidEmail(email)) {
      return badRequest("Valid email is required");
    }

    const ip = getClientIp(req) || "unknown";

    const ipAllowed = await isRateLimitAllowed(`ip:${ip}:newsletter`, 60, 10);
    const emailAllowed = await isRateLimitAllowed(
      `email:${email}:newsletter`,
      300,
      3
    );

    if (!ipAllowed || !emailAllowed) {
      return tooManyRequests("Too many attempts. Try again soon.");
    }

    const appUrl = process.env.APP_URL;

    if (!appUrl) {
      return serverError("Server error");
    }

    const { data: existingSubscriber, error: existingError } =
      await supabaseAdmin
        .from("newsletter_subscribers")
        .select("email,confirmed,confirmed_at")
        .eq("email", email)
        .maybeSingle();

    if (existingError) {
      console.error("NEWSLETTER_LOOKUP_FAILED", {
        message: existingError.message,
      });
      return serverError("Failed to save subscription");
    }

    if (!existingSubscriber) {
      const { error: insertError } = await supabaseAdmin
        .from("newsletter_subscribers")
        .insert({
          email,
          confirm_token_hash: null,
          confirmed: false,
          confirmed_at: null,
        });

      if (insertError) {
        console.error("NEWSLETTER_INSERT_FAILED", {
          message: insertError.message,
        });
        return serverError("Failed to save subscription");
      }
    }

    await supabaseAdmin
      .from("auth_tokens")
      .delete()
      .eq("email", email)
      .eq("purpose", "newsletter_confirm")
      .is("consumed_at", null);

    const rawToken = generateToken(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAtIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await supabaseAdmin
      .from("auth_tokens")
      .insert({
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

    if (tokenError) {
      console.error("NEWSLETTER_TOKEN_INSERT_FAILED", {
        message: tokenError.message,
      });
      return serverError("Failed to create confirmation link");
    }

    const confirmUrl = `${appUrl}/confirm?type=newsletter&token=${encodeURIComponent(
      rawToken
    )}`;

    const emailSent = await sendEmail({
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

    if (!emailSent) {
      await supabaseAdmin
        .from("auth_tokens")
        .delete()
        .eq("token_hash", tokenHash)
        .eq("purpose", "newsletter_confirm")
        .is("consumed_at", null);

      return serverError("Failed to send confirmation email");
    }

    return jsonNoStore({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("NEWSLETTER_ERROR", { message });

    return serverError("Internal server error");
  }
}