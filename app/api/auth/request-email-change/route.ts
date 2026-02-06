// app/api/auth/request-email-change/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateToken, sha256Hex } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const { token, newEmail, turnstileToken } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }
    if (!newEmail) {
      return NextResponse.json({ error: "Missing newEmail" }, { status: 400 });
    }
    if (!turnstileToken) {
      return NextResponse.json({ error: "Missing captcha" }, { status: 400 });
    }

    // ✅ Turnstile verification
    const okCaptcha = await verifyTurnstile(
      turnstileToken,
      req.headers.get("x-forwarded-for")
    );
    if (!okCaptcha) {
      return NextResponse.json({ error: "Captcha failed" }, { status: 400 });
    }

    // ✅ Verify logged-in user via their JWT
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userData.user;
    const oldEmail = normalizeEmail(user.email || "");
    const nextEmail = normalizeEmail(newEmail);

    if (!oldEmail) {
      return NextResponse.json({ error: "User email missing" }, { status: 400 });
    }
    if (oldEmail === nextEmail) {
      return NextResponse.json({ error: "New email must be different" }, { status: 400 });
    }

    // ✅ Optional: prevent changing to an email already used by another account
// Supabase typings may not include `filter`, so we cast to any.
const { data: usersData, error: usersErr } = await (supabaseAdmin.auth.admin as any).listUsers({
  page: 1,
  perPage: 1,
  filter: `email=eq.${nextEmail}`,
});

if (!usersErr) {
  const match = usersData?.users?.[0];
  if (match && match.id !== user.id) {
    return NextResponse.json(
      { error: "Unable to use that email address." },
      { status: 400 }
    );
  }
}
    // If listUsers errors, we just skip this optional check and let the update step handle conflicts.

    // ✅ Optional: delete any previous pending requests (avoids multiple valid links)
    await supabaseAdmin
      .from("email_change_requests")
      .delete()
      .eq("user_id", user.id)
      .is("confirmed_at", null);

    // ✅ Create verification token (store hash only)
    const raw = generateToken(32);
    const tokenHash = sha256Hex(raw);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    // ✅ Store request
    const { error: insErr } = await supabaseAdmin.from("email_change_requests").insert({
      user_id: user.id,
      old_email: oldEmail,
      new_email: nextEmail,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });

    if (insErr) {
      return NextResponse.json({ error: "Could not create request" }, { status: 500 });
    }

    // ✅ Use existing /confirm page with a type param
    const appUrl = process.env.APP_URL || "https://tonemender.com";
    const confirmUrl = `${appUrl}/confirm?type=email-change&token=${raw}`;

    await sendEmail({
      to: nextEmail,
      subject: "Confirm your new ToneMender email",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>Confirm your new email</h2>
          <p>Click the button below to confirm this email for your ToneMender account.</p>
          <p>
            <a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">
              Confirm email
            </a>
          </p>
          <p>If you didn’t request this, you can ignore this email.</p>
          <p style="color:#666;font-size:12px">This link expires in 30 minutes.</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}