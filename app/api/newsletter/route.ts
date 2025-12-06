import { NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
export async function POST(req: Request) {
  const { email } = await req.json()

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 })
  }

  const token = crypto.randomBytes(32).toString("hex")

  // Insert or ignore duplicates
  const { error } = await supabase
    .from("newsletter_subscribers")
    .upsert(
      { email, confirm_token: token, confirmed: false },
      { onConflict: "email" }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ✅ Send confirmation email
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ToneMender <updates@tonemender.com>",
      to: email,
      subject: "Confirm your ToneMender updates",
      html: `
        <p>Thanks for joining ToneMender 👋</p>
        <p>Please confirm your email:</p>
        <a href="https://tonemender.com/confirm?token=${token}">
          Confirm my email
        </a>
      `,
    }),
  })

  return NextResponse.json({ success: true })
}