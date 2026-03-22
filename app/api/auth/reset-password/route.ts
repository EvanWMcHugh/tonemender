import bcrypt from "bcryptjs";

import { badRequest, jsonNoStore, forbidden, serverError } from "@/lib/api/responses";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sendEmail } from "@/lib/email/send-email";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

type ResetPasswordBody = {
  token?: unknown;
  newPassword?: unknown;
};

async function audit(
  event: string,
  userId: string | null,
  req: Request,
  meta: Record<string, unknown> = {}
): Promise<void> {
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
    let body: ResetPasswordBody = {};

    try {
      body = (await req.json()) as ResetPasswordBody;
    } catch {
      return badRequest("Invalid request body");
    }

    const { token, newPassword } = body;

    if (typeof token !== "string" || !token) {
      return badRequest("Missing token");
    }

    if (typeof newPassword !== "string" || !newPassword) {
      return badRequest("Missing new password");
    }

    if (!newPassword.trim()) {
      return badRequest("Password cannot be blank");
    }

    if (newPassword.length < 8) {
      return badRequest("Password must be at least 8 characters");
    }

    if (newPassword.length > 200) {
      return badRequest("Password is too long");
    }

    const tokenHash = sha256Hex(token);
    const nowIso = new Date().toISOString();

    const { data: consumedToken, error: consumeError } = await supabaseAdmin
      .from("auth_tokens")
      .update({ consumed_at: nowIso })
      .eq("token_hash", tokenHash)
      .eq("purpose", "password_reset")
      .is("consumed_at", null)
      .gt("expires_at", nowIso)
      .select("id,user_id,email")
      .maybeSingle();

    if (consumeError) {
      return serverError("Failed to validate token");
    }

    if (!consumedToken?.id || !consumedToken.user_id) {
      return badRequest("Invalid or expired token");
    }

    const userId = String(consumedToken.user_id);

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("email,disabled_at,deleted_at")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return serverError("Failed to update password");
    }

    if (user.disabled_at || user.deleted_at) {
      return forbidden("Account unavailable");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ password_hash: passwordHash })
      .eq("id", userId);

    if (updateError) {
      return serverError(
        "Failed to update password. Please request a new reset link."
      );
    }

    const { error: revokeError } = await supabaseAdmin
      .from("sessions")
      .update({ revoked_at: nowIso })
      .eq("user_id", userId)
      .is("revoked_at", null);

    if (revokeError) {
      console.warn("PASSWORD_RESET_REVOKE_SESSIONS_FAILED", {
        message: revokeError.message,
      });
    }

    await audit("PASSWORD_RESET_COMPLETED", userId, req);

    try {
      const to = String(user.email || consumedToken.email || "").trim().toLowerCase();

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
    const message = err instanceof Error ? err.message : String(err);

    console.error("RESET_PASSWORD_ERROR", { message });

    return serverError("Server error");
  }
}