// app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // ✅ Basic password rules (keep simple)
    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json({ error: "Missing new password" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (newPassword.length > 200) {
      return NextResponse.json({ error: "Password is too long" }, { status: 400 });
    }

    const tokenHash = sha256Hex(token);
    const now = new Date();

    // ✅ First try to find an unused token
    const { data: row, error: findErr } = await supabaseAdmin
      .from("password_reset_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .single();

    if (findErr || !row) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    // ✅ If already used, tell them clearly
    if (row.used_at) {
      return NextResponse.json(
        { error: "This reset link has already been used. Please request a new one." },
        { status: 400 }
      );
    }

    // ✅ Expired?
    if (new Date(row.expires_at) < now) {
      return NextResponse.json(
        { error: "Token expired. Please request a new reset link." },
        { status: 400 }
      );
    }

    // ✅ Update password via admin
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(row.user_id, {
      password: newPassword,
    });

    if (updErr) {
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
    }

    // ✅ Mark token used
    await supabaseAdmin
      .from("password_reset_tokens")
      .update({ used_at: now.toISOString() })
      .eq("id", row.id);

    // ✅ Cleanup any other unused tokens for this user
    await supabaseAdmin
      .from("password_reset_tokens")
      .delete()
      .eq("user_id", row.user_id)
      .is("used_at", null);

    // ✅ Notify
    await sendEmail({
      to: row.email,
      subject: "Your ToneMender password was changed",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>Password updated</h2>
          <p>Your ToneMender password was just changed.</p>
          <p>If this wasn’t you, reset your password again immediately and contact support.</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}