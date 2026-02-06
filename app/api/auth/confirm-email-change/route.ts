// app/api/auth/confirm-email-change/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

function isEmailInUseError(err: any) {
  const msg = (err?.message || err?.error_description || "").toString().toLowerCase();
  return msg.includes("already") && msg.includes("email");
}

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const tokenHash = sha256Hex(token);
    const now = new Date();

    // ✅ Try to find the request (prefer unconfirmed, but allow already-confirmed for idempotency)
    const { data: reqRow, error: findErr } = await supabaseAdmin
      .from("email_change_requests")
      .select("*")
      .eq("token_hash", tokenHash)
      .single();

    if (findErr || !reqRow) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    // ✅ If already confirmed, return OK (idempotent)
    if (reqRow.confirmed_at) {
      return NextResponse.json({ ok: true, alreadyConfirmed: true });
    }

    // ✅ Expired?
    if (new Date(reqRow.expires_at) < now) {
      return NextResponse.json({ error: "Token expired" }, { status: 400 });
    }

    // ✅ Update email in Supabase Auth (admin)
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(reqRow.user_id, {
      email: reqRow.new_email,
      // We are doing our own confirmation link, so mark as confirmed.
      email_confirm: true,
    });

    if (updErr) {
      // If the email is already in use, return a clean 400 for UI
      if (isEmailInUseError(updErr)) {
        return NextResponse.json(
          { error: "That email address is already in use. Please choose another." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: "Failed to update email" }, { status: 500 });
    }

    // ✅ Mark confirmed
    await supabaseAdmin
      .from("email_change_requests")
      .update({ confirmed_at: now.toISOString() })
      .eq("id", reqRow.id);

    // ✅ Cleanup any other pending requests for this user (keeps table tidy)
    await supabaseAdmin
      .from("email_change_requests")
      .delete()
      .eq("user_id", reqRow.user_id)
      .is("confirmed_at", null);

    // ✅ Notify OLD email after success
    await sendEmail({
      to: reqRow.old_email,
      subject: "Your ToneMender email was changed",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>Email changed</h2>
          <p>Your ToneMender account email was changed to: <b>${reqRow.new_email}</b></p>
          <p>If this wasn’t you, contact support immediately.</p>
        </div>
      `,
    });

    // ✅ Notify NEW email after success
    await sendEmail({
      to: reqRow.new_email,
      subject: "Your ToneMender email is now active",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>All set</h2>
          <p>This email is now the active email for your ToneMender account.</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}