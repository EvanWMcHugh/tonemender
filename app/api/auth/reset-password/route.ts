// app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sha256Hex } from "@/lib/security/crypto";
import { sendEmail } from "@/lib/email/sendEmail";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}

async function audit(event: string, userId: string | null, req: Request, meta: Record<string, any> = {}) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      event,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      meta,
    });
  } catch {}
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const newPassword = body?.newPassword;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing token" }, { status: 400 });
    }

    // Basic password rules (keep simple)
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
    const nowIso = new Date().toISOString();

    // 1) Atomically consume reset token (single-use) with guards
    const { data: tok, error: consumeErr } = await supabaseAdmin
      .from("auth_tokens")
      .update({ consumed_at: nowIso })
      .eq("token_hash", tokenHash)
      .eq("purpose", "password_reset")
      .is("consumed_at", null)
      .gt("expires_at", nowIso)
      .select("id,user_id,email")
      .maybeSingle();

    if (consumeErr) {
      return jsonNoStore({ error: "Failed to validate token" }, { status: 500 });
    }
    if (!tok?.id || !tok.user_id) {
      return jsonNoStore({ error: "Invalid or expired token" }, { status: 400 });
    }

    const userId = String(tok.user_id);

    // Optional: ensure user is not disabled/deleted (token is already consumed; but prevents changing a dead account)
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("email,disabled_at,deleted_at")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !user) {
      return jsonNoStore({ error: "Failed to update password" }, { status: 500 });
    }
    if (user.disabled_at || user.deleted_at) {
      return jsonNoStore({ error: "Account unavailable" }, { status: 403 });
    }

    // 2) Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const { error: updErr } = await supabaseAdmin
      .from("users")
      .update({ password_hash: passwordHash })
      .eq("id", userId);

    if (updErr) {
      // Token is already consumed; safest is to require a new reset request.
      return jsonNoStore({ error: "Failed to update password. Please request a new reset link." }, { status: 500 });
    }

    // 3) Security: revoke all sessions
    try {
      await supabaseAdmin
        .from("sessions")
        .update({ revoked_at: nowIso })
        .eq("user_id", userId)
        .is("revoked_at", null);
    } catch {}

    await audit("PASSWORD_RESET_COMPLETED", userId, req, {});

    // 4) Notify (best effort) - use user.email (source of truth)
    try {
      const to = String(user.email || tok.email || "");
      if (to) {
        await sendEmail({
          to,
          subject: "Your ToneMender password was changed",
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.4">
              <h2>Password updated</h2>
              <p>Your ToneMender password was just changed.</p>
              <p>If this wasn’t you, request another password reset immediately and contact support.</p>
            </div>
          `,
        });
      }
    } catch {}

    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}