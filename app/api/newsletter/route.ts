import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

/* ----------------------------
   ENV SAFETY CHECKS
----------------------------- */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const resendKey = process.env.RESEND_API_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseKey) throw new Error("Missing SUPABASE_SECRET_KEY");
if (!resendKey) throw new Error("Missing RESEND_API_KEY");
if (!siteUrl) throw new Error("Missing NEXT_PUBLIC_SITE_URL");

/* ----------------------------
   SUPABASE CLIENT
----------------------------- */
const supabase = createClient(supabaseUrl, supabaseKey);

/* ----------------------------
   POST HANDLER
----------------------------- */
export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email" },
        { status: 400 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");

    /* ----------------------------
       UPSERT EMAIL
    ----------------------------- */
    const { error: insertError } = await supabase
      .from("newsletter_subscribers")
      .upsert(
        {
          email,
          confirm_token: token,
          confirmed: false,
        },
        { onConflict: "email" }
      );

    if (insertError) {
      console.error("SUPABASE ERROR:", insertError);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 }
      );
    }

    /* ----------------------------
       SEND CONFIRMATION EMAIL
    ----------------------------- */
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ToneMender <updates@tonemender.com>", // ✅ SAFE SENDER
        to: email,
        subject: "Confirm your ToneMender updates",
        html: `
          <p>Thanks for joining ToneMender 👋</p>
          <p>Please confirm your email:</p>
          <p>
            <a href="${siteUrl}/confirm?token=${token}">
              Confirm my email
            </a>
          </p>
        `,
      }),
    });

    let emailResult = null;
    try {
      emailResult = await emailRes.json();
    } catch {
      emailResult = null;
    }

    if (!emailRes.ok) {
      console.error("❌ RESEND FAILED:", emailResult);
      return NextResponse.json(
        { error: "Email failed to send", details: emailResult },
        { status: 500 }
      );
    }

    /* ----------------------------
       SUCCESS
    ----------------------------- */
    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("NEWSLETTER API ERROR:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}