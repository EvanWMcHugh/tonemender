// app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function isExpired(expiresAt: string) {
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t < Date.now();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const newPassword = body?.newPassword;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing token" }, { status: 400 });
    }

    // ✅ Basic password rules (keep simple)
    if (!newPassword || typeof newPassword !== "string") {
      return jsonNoStore({ error: "Missing new password" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return jsonNoStore({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (newPassword.length > 200) {
      return jsonNoStore({ error: "Password is too long" }, { status: 400 });
    }

    const tokenHash = sha256Hex(token);

    // ✅ Find token row (unused)
    const { data: row, error: findErr } = await supabaseAdmin
      .from("password_reset_tokens")
      .select("id,user_id,email,expires_at,used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (findErr || !row) {
      return jsonNoStore({ error: "Invalid or expired token" }, { status: 400 });
    }

    if (row.used_at) {
      return jsonNoStore(
        { error: "This reset link has already been used. Please request a new one." },
        { status: 400 }
      );
    }

    if (!row.expires_at || isExpired(row.expires_at)) {
      return jsonNoStore(
        { error: "Token expired. Please request a new reset link." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    // ✅ Mark token used first (race-safe)
    const { data: used, error: usedErr } = await supabaseAdmin
      .from("password_reset_tokens")
      .update({ used_at: nowIso })
      .eq("id", row.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();

    if (usedErr) {
      return jsonNoStore({ error: "Failed to update password" }, { status: 500 });
    }
    if (!used?.id) {
      return jsonNoStore(
        { error: "This reset link has already been used. Please request a new one." },
        { status: 400 }
      );
    }

    // ✅ Update password in your custom users table
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const { error: updErr } = await supabaseAdmin
      .from("users")
      .update({ password_hash: passwordHash })
      .eq("id", row.user_id);

    if (updErr) {
      // Roll back token usage so user can retry if user update failed
      try {
        await supabaseAdmin.from("password_reset_tokens").update({ used_at: null }).eq("id", row.id);
      } catch {}
      return jsonNoStore({ error: "Failed to update password" }, { status: 500 });
    }

    // ✅ Cleanup any other unused tokens for this user
    try {
      await supabaseAdmin
        .from("password_reset_tokens")
        .delete()
        .eq("user_id", row.user_id)
        .is("used_at", null);
    } catch {}

    // ✅ Security: invalidate all sessions
    try {
      await supabaseAdmin.from("sessions").delete().eq("user_id", row.user_id);
    } catch {}

    // ✅ Notify (best effort)
    try {
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
    } catch {}

    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}