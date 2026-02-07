import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { generateToken, sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const email = body?.email;

    if (!email || typeof email !== "string") {
      return jsonNoStore({ error: "Valid email is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const rawToken = generateToken(32);
    const tokenHash = sha256Hex(rawToken);

    const { error: dbError } = await supabaseAdmin
      .from("newsletter_subscribers")
      .upsert(
        {
          email: normalizedEmail,
          confirm_token_hash: tokenHash,
          confirmed: false,
          confirmed_at: null,
        },
        { onConflict: "email" }
      );

    if (dbError) {
      console.error("Newsletter DB error:", dbError);
      return jsonNoStore({ error: "Failed to save subscription" }, { status: 500 });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return jsonNoStore({ error: "APP_URL is not set" }, { status: 500 });
    }

    const confirmUrl = `${appUrl}/confirm?token=${rawToken}`;

    await sendEmail({
      to: normalizedEmail,
      subject: "Confirm your ToneMender newsletter subscription",
      html: `
        <p>Thanks for subscribing to the ToneMender newsletter!</p>
        <p>Click the link below to confirm your subscription:</p>
        <p><a href="${confirmUrl}">Confirm subscription</a></p>
        <p>If you didn’t request this, you can safely ignore this email.</p>
      `,
    });

    return jsonNoStore({ success: true });
  } catch (err) {
    console.error("Newsletter error:", err);
    return jsonNoStore({ error: "Internal server error" }, { status: 500 });
  }
}