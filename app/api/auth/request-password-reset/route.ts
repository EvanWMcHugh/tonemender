import { badRequest, jsonNoStore, serverError } from "@/lib/api/responses";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sendEmail } from "@/lib/email/send-email";
import {
  getClientIp,
  getClientPlatform,
  getUserAgent,
} from "@/lib/request/client-meta";
import { verifyIosAppAttestAssertion } from "@/lib/security/app-attest";
import { generateToken, sha256Hex } from "@/lib/security/crypto";
import { verifyAndroidPlayIntegrity } from "@/lib/security/play-integrity";
import { verifyTurnstile } from "@/lib/security/turnstile";

export const runtime = "nodejs";

const ANDROID_PACKAGE_NAME =
  process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.tonemender.app";

type RequestPasswordResetBody = {
  email?: unknown;
  turnstileToken?: unknown;
  integrityToken?: unknown;
  integrityRequestHash?: unknown;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAndroidClient(req: Request): boolean {
  return getClientPlatform(req) === "android";
}

function isIosClient(req: Request): boolean {
  return getClientPlatform(req) === "ios";
}

function sanitizeJsonText(raw: string): string {
  return raw.replace(/^\uFEFF/, "").trim();
}

async function parseJsonBody<T>(
  req: Request
): Promise<
  | {
      ok: true;
      body: T;
      rawText: string;
      rawBodyBuffer: Buffer;
    }
  | {
      ok: false;
    }
> {
  const rawText = await req.text();
  const normalized = sanitizeJsonText(rawText);
  const rawBodyBuffer = Buffer.from(normalized, "utf8");

  if (!normalized) {
    return {
      ok: true,
      body: {} as T,
      rawText: normalized,
      rawBodyBuffer,
    };
  }

  try {
    return {
      ok: true,
      body: JSON.parse(normalized) as T,
      rawText: normalized,
      rawBodyBuffer,
    };
  } catch {
    return { ok: false };
  }
}

async function isRateLimitAllowed(
  key: string,
  windowSeconds: number,
  limit: number
): Promise<boolean> {
  const now = Date.now();
  const windowStartSeconds =
    Math.floor(now / 1000 / windowSeconds) * windowSeconds;
  const windowStartIso = new Date(windowStartSeconds * 1000).toISOString();

  const { data: row } = await supabaseAdmin
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds)
    .maybeSingle();

  if (!row) {
    const { error: insertError } = await supabaseAdmin
      .from("rate_limits")
      .insert({
        key,
        window_start: windowStartIso,
        window_seconds: windowSeconds,
        count: 1,
      });

    if (insertError) return true;
    return true;
  }

  const nextCount = (row.count ?? 0) + 1;

  const { error: updateError } = await supabaseAdmin
    .from("rate_limits")
    .update({ count: nextCount })
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds);

  if (updateError) return true;
  return nextCount <= limit;
}

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

// Never reveal whether an email exists.
// Return { ok: true } unless the request itself is malformed or protection fails.
export async function POST(req: Request) {
  try {
    const parsed = await parseJsonBody<RequestPasswordResetBody>(req);

    if (!parsed.ok) {
      return jsonNoStore({ ok: true });
    }

    const { body, rawBodyBuffer } = parsed;

    const { email, turnstileToken, integrityToken, integrityRequestHash } = body;

    if (typeof email !== "string" || !email.trim()) {
      return jsonNoStore({ ok: true });
    }

    const normalizedEmail = normalizeEmail(email);
    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);
    const iosClient = isIosClient(req);

    const ipAllowed = await isRateLimitAllowed(
      `ip:${ip}:pw_reset_request`,
      60,
      10
    );
    const emailAllowed = await isRateLimitAllowed(
      `email:${normalizedEmail}:pw_reset_request`,
      300,
      5
    );

    if (!ipAllowed || !emailAllowed) {
      return jsonNoStore({ ok: true });
    }

    if (androidClient) {
      if (typeof integrityToken !== "string" || !integrityToken) {
        return badRequest("Integrity verification required");
      }

      if (
        typeof integrityRequestHash !== "string" ||
        !integrityRequestHash
      ) {
        return badRequest("Integrity request hash required");
      }

      const integrity = await verifyAndroidPlayIntegrity({
        integrityToken,
        expectedPackageName: ANDROID_PACKAGE_NAME,
        expectedRequestHash: integrityRequestHash,
      });

      if (!integrity.ok) {
        await audit("PASSWORD_RESET_INTEGRITY_FAILED", null, req, {
          email: normalizedEmail,
          reason: integrity.reason,
          payload: integrity.payload ?? null,
        });

        return jsonNoStore(
          {
            ok: false,
            error: integrity.publicMessage,
            reason: integrity.reason,
            payload:
              process.env.NODE_ENV === "development"
                ? integrity.payload ?? null
                : undefined,
          },
          { status: 403 }
        );
      }
    } else if (iosClient) {
      const keyId = req.headers.get("x-app-attest-key-id");
      const assertion = req.headers.get("x-app-attest-assertion");
      const challengeId = req.headers.get("x-app-attest-challenge-id");

      if (!keyId || !assertion || !challengeId) {
        return badRequest("Integrity verification required");
      }

      const integrity = await verifyIosAppAttestAssertion({
        keyId,
        assertion,
        challengeId,
        method: "POST",
        path: "/api/auth/request-password-reset",
        requestBody: rawBodyBuffer,
      });

      if (!integrity.ok) {
        await audit("PASSWORD_RESET_IOS_APP_ATTEST_FAILED", null, req, {
          email: normalizedEmail,
          reason: integrity.reason,
          payload: integrity.payload ?? null,
        });

        return jsonNoStore(
          {
            ok: false,
            error: integrity.publicMessage,
            reason: integrity.reason,
            payload:
              process.env.NODE_ENV === "development"
                ? integrity.payload ?? null
                : undefined,
          },
          { status: 403 }
        );
      }
    } else {
      if (typeof turnstileToken !== "string" || !turnstileToken) {
        return badRequest("Missing captcha");
      }

      const captchaOk = await verifyTurnstile(turnstileToken, getClientIp(req));

      if (!captchaOk) {
        await audit("PASSWORD_RESET_CAPTCHA_FAILED", null, req, {
          email: normalizedEmail,
        });

        return badRequest("Captcha failed");
      }
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id,email,disabled_at,deleted_at")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (userError || !user?.id) {
      return jsonNoStore({ ok: true });
    }

    if (user.disabled_at || user.deleted_at) {
      return jsonNoStore({ ok: true });
    }

    const userId = String(user.id);

    await supabaseAdmin
      .from("auth_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("purpose", "password_reset")
      .is("consumed_at", null);

    const rawToken = generateToken(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAtIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin.from("auth_tokens").insert({
      user_id: userId,
      email: normalizedEmail,
      token_hash: tokenHash,
      purpose: "password_reset",
      expires_at: expiresAtIso,
      created_ip: getClientIp(req),
      created_ua: getUserAgent(req),
      data: {},
    });

    if (insertError) {
      return jsonNoStore({ ok: true });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return serverError("Missing APP_URL");
    }

    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(
      rawToken
    )}`;

    await sendEmail({
      to: normalizedEmail,
      subject: "Reset your ToneMender password",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>Reset your password</h2>
          <p>Click below to set a new password.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">
              Reset password
            </a>
          </p>
          <p style="color:#6b7280;font-size:12px">
            If the button doesn’t work, copy and paste this link:<br/>
            <span>${resetUrl}</span>
          </p>
          <p>If you didn’t request this, ignore this email.</p>
          <p style="color:#666;font-size:12px">This link expires in 30 minutes.</p>
        </div>
      `,
    });

    await audit("PASSWORD_RESET_REQUESTED", userId, req, {
      androidClient,
      iosClient,
    });

    return jsonNoStore({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("REQUEST_PASSWORD_RESET_ERROR", { message });

    return jsonNoStore({ ok: true });
  }
}