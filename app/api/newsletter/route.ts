import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { makeToken, sha256 } from "@/lib/authTokens";

export const runtime = "nodejs";

/**
 * This refactor uses ALL helpers + “optional hardening”:
 * - supabaseAdmin (no local createClient)
 * - sendEmail helper (no direct Resend fetch)
 * - hashed tokens (never store raw token in DB)
 * - consistent no-store JSON responses
 *
 * IMPORTANT DB CHANGE REQUIRED:
 * Your table currently uses confirm_token (plaintext).
 * This version expects confirm_token_hash instead.
 *
 * Run:
 *   alter table public.newsletter_subscribers
 *     add column if not exists confirm_token_hash text;
 *
 *   create index if not exists newsletter_subscribers_confirm_token_hash_idx
 *     on public.newsletter_subscribers(confirm_token_hash);
 *
 * Optional cleanup after confirming works:
 *   alter table public.newsletter_subscribers drop column confirm_token;
 */

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// Simple email validation (good enough for signup forms without being overly strict)
function isValidEmail(email: string) {
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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
    if (!emailRaw || typeof emailRaw !== "string") {
      return jsonNoStore({ error: "Invalid email" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    if (!isValidEmail(email)) {
      return jsonNoStore({ error: "Invalid email" }, { status: 400 });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) return jsonNoStore({ error: "Missing APP_URL" }, { status: 500 });

    // ✅ New token each submit; store only hash
    const token = makeToken();
    const tokenHash = sha256(token);

    /* ----------------------------
       UPSERT EMAIL (no leaks)
       - Always set confirmed=false and fresh token hash
       - Keeps links fresh for re-submits
    ----------------------------- */
    const { error: upsertError } = await supabaseAdmin
      .from("newsletter_subscribers")
      .upsert(
        {
          email,
          confirm_token_hash: tokenHash,
          confirmed: false,
          confirmed_at: null,
        },
        { onConflict: "email" }
      );

    if (upsertError) {
      console.error("NEWSLETTER SUPABASE ERROR:", upsertError);
      return jsonNoStore({ error: "Database error" }, { status: 500 });
    }

    /* ----------------------------
       SEND CONFIRMATION EMAIL (Resend helper)
    ----------------------------- */
    const confirmUrl = `${appUrl}/confirm?token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: email,
      subject: "Confirm your ToneMender updates",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.5;">
          <p>Thanks for joining ToneMender 👋</p>
          <p>Please confirm your email:</p>
          <p>
            <a href="${confirmUrl}" style="display:inline-block; padding:10px 14px; background:#111827; color:#fff; text-decoration:none; border-radius:8px;">
              Confirm my email
            </a>
          </p>
          <p style="color:#6b7280; font-size:12px;">
            If the button doesn’t work, copy and paste this link:<br/>
            <span>${confirmUrl}</span>
          </p>
        </div>
      `,
    });

    // Even if email sending fails, sendEmail() won’t throw (by design).
    // Returning success keeps the endpoint non-enumerable and avoids leaking provider issues.
    return jsonNoStore({ success: true });
  } catch (err) {
    console.error("NEWSLETTER API ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}