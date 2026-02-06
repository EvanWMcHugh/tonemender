import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* ----------------------------
   ENV
----------------------------- */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const resendKey = process.env.RESEND_API_KEY;
const appUrl = process.env.APP_URL;
const emailFrom = process.env.EMAIL_FROM || "ToneMender <no-reply@tonemender.com>";

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseKey) throw new Error("Missing SUPABASE_SECRET_KEY");
if (!resendKey) throw new Error("Missing RESEND_API_KEY");
if (!appUrl) throw new Error("Missing APP_URL");

/* ----------------------------
   SUPABASE CLIENT (server)
----------------------------- */
const supabaseServer = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

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

    // New confirmation token each time user submits (keeps links fresh)
    const token = crypto.randomBytes(32).toString("hex");

    /* ----------------------------
       UPSERT EMAIL
    ----------------------------- */
    const { error: upsertError } = await supabaseServer
      .from("newsletter_subscribers")
      .upsert(
        {
          email,
          confirm_token: token,
          confirmed: false,
          confirmed_at: null,
        },
        { onConflict: "email" }
      );

    if (upsertError) {
      console.error("SUPABASE ERROR:", upsertError);
      return jsonNoStore({ error: "Database error" }, { status: 500 });
    }

    /* ----------------------------
       SEND CONFIRMATION EMAIL (Resend)
    ----------------------------- */
    const confirmUrl = `${appUrl}/confirm?token=${encodeURIComponent(token)}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
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
      }),
    });

    let emailResult: any = null;
    try {
      emailResult = await emailRes.json();
    } catch {
      emailResult = null;
    }

    if (!emailRes.ok) {
      console.error("❌ RESEND FAILED:", emailResult);
      // Avoid echoing provider details to the client
      return jsonNoStore({ error: "Email failed to send" }, { status: 502 });
    }

    return jsonNoStore({ success: true });
  } catch (err) {
    console.error("NEWSLETTER API ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}