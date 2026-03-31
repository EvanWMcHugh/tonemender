import {
  badRequest,
  jsonNoStore,
  serverError,
  tooManyRequests,
  unauthorized,
} from "@/lib/api/responses";
import { getSessionCookie } from "@/lib/auth/cookies";
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

type RequestEmailChangeBody = {
  newEmail?: unknown;
  turnstileToken?: unknown;
  integrityToken?: unknown;
  integrityRequestHash?: unknown;
};

type SessionUser = {
  id: string;
  email: string;
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

  const { data: existing } = await supabaseAdmin
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await supabaseAdmin
      .from("rate_limits")
      .insert({
        key,
        window_start: windowStartIso,
        window_seconds: windowSeconds,
        count: 1,
      });

    if (insertError) {
      return true;
    }

    return true;
  }

  const nextCount = (existing.count ?? 0) + 1;

  const { error: updateError } = await supabaseAdmin
    .from("rate_limits")
    .update({ count: nextCount })
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds);

  if (updateError) {
    return true;
  }

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

async function getUserFromSession(req: Request): Promise<SessionUser | null> {
  const rawSessionToken = getSessionCookie(req);
  if (!rawSessionToken) return null;

  const sessionTokenHash = sha256Hex(rawSessionToken);
  const nowIso = new Date().toISOString();

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("user_id, expires_at, revoked_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionError || !session?.user_id) return null;
  if (session.revoked_at) return null;
  if (!session.expires_at || session.expires_at <= nowIso) return null;

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, email, disabled_at, deleted_at")
    .eq("id", session.user_id)
    .maybeSingle();

  if (userError || !user?.id || !user.email) return null;
  if (user.disabled_at || user.deleted_at) return null;

  const { error: updateError } = await supabaseAdmin
    .from("sessions")
    .update({ last_seen_at: nowIso })
    .eq("session_token_hash", sessionTokenHash)
    .is("revoked_at", null);

  if (updateError) {
    console.error("Failed to update session last_seen_at", {
      message: updateError.message,
    });
  }

  return {
    id: String(user.id),
    email: String(user.email),
  };
}

export async function POST(req: Request) {
  try {
    const parsed = await parseJsonBody<RequestEmailChangeBody>(req);

    if (!parsed.ok) {
      return badRequest("Invalid JSON body");
    }

    const { body, rawBodyBuffer } = parsed;

    const { newEmail, turnstileToken, integrityToken, integrityRequestHash } =
      body;

    if (typeof newEmail !== "string" || !newEmail.trim()) {
      return badRequest("Missing newEmail");
    }

    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);
    const iosClient = isIosClient(req);

    const ipAllowed = await isRateLimitAllowed(
      `ip:${ip}:email_change_request`,
      60,
      10
    );

    if (!ipAllowed) {
      return tooManyRequests("Too many attempts. Try again soon.");
    }

    const me = await getUserFromSession(req);

    if (!me) {
      return unauthorized("Unauthorized");
    }

    const userId = me.id;
    const oldEmail = normalizeEmail(me.email);
    const nextEmail = normalizeEmail(newEmail);

    const userAllowed = await isRateLimitAllowed(
      `user:${userId}:email_change_request`,
      300,
      5
    );

    if (!userAllowed) {
      return tooManyRequests("Too many attempts. Try again soon.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRegex.test(nextEmail)) {
      return badRequest("Invalid email");
    }

    if (oldEmail === nextEmail) {
      return badRequest("New email must be different");
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
        await audit("EMAIL_CHANGE_REQUEST_INTEGRITY_FAILED", userId, req, {
          next_email: nextEmail,
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
        path: "/api/auth/request-email-change",
        requestBody: rawBodyBuffer,
      });

      if (!integrity.ok) {
        await audit("EMAIL_CHANGE_REQUEST_IOS_APP_ATTEST_FAILED", userId, req, {
          next_email: nextEmail,
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

      const okCaptcha = await verifyTurnstile(turnstileToken, getClientIp(req));

      if (!okCaptcha) {
        await audit("EMAIL_CHANGE_REQUEST_CAPTCHA_FAILED", userId, req, {
          next_email: nextEmail,
        });

        return badRequest("Captcha failed");
      }
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", nextEmail)
      .maybeSingle();

    if (existingError) {
      return serverError("Could not validate email");
    }

    if (existing && existing.id !== userId) {
      return badRequest("Unable to use that email address.");
    }

    await supabaseAdmin
      .from("auth_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("purpose", "email_change")
      .is("consumed_at", null);

    const rawToken = generateToken(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAtIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin.from("auth_tokens").insert({
      user_id: userId,
      token_hash: tokenHash,
      purpose: "email_change",
      expires_at: expiresAtIso,
      created_ip: getClientIp(req),
      created_ua: getUserAgent(req),
      data: {
        new_email: nextEmail,
        old_email: oldEmail,
      },
    });

    if (insertError) {
      return serverError("Could not create request");
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return serverError("Missing APP_URL");
    }

    const confirmUrl = `${appUrl}/confirm?type=email-change&token=${encodeURIComponent(
      rawToken
    )}`;

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

    await audit("EMAIL_CHANGE_REQUESTED", userId, req, {
      next_email: nextEmail,
      androidClient,
      iosClient,
    });

    return jsonNoStore({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("REQUEST_EMAIL_CHANGE_ERROR", { message });

    return serverError("Server error");
  }
}