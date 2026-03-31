import bcrypt from "bcryptjs";

import {
  badRequest,
  forbidden,
  jsonNoStore,
  serverError,
  tooManyRequests,
} from "@/lib/api/responses";
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

type SignUpBody = {
  email?: unknown;
  password?: unknown;
  captchaToken?: unknown;
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

function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

export async function POST(req: Request) {
  try {
    const parsed = await parseJsonBody<SignUpBody>(req);

    if (!parsed.ok) {
      return badRequest("Invalid request body");
    }

    const { body, rawText, rawBodyBuffer } = parsed;

    const {
      email: emailRaw,
      password,
      captchaToken,
      integrityToken,
      integrityRequestHash,
    } = body;

    if (process.env.NODE_ENV === "development") {
      console.log("SIGN_UP_REQUEST_DEBUG", {
        contentType: req.headers.get("content-type"),
        rawBodyLength: rawText.length,
        bodyKeys:
          body && typeof body === "object" ? Object.keys(body) : [],
        hasEmail: typeof emailRaw === "string" && emailRaw.trim().length > 0,
        hasPassword: typeof password === "string" && password.length > 0,
        androidClient: isAndroidClient(req),
        iosClient: isIosClient(req),
      });
    }

    if (typeof emailRaw !== "string" || !emailRaw.trim()) {
      return badRequest("Missing email");
    }

    if (typeof password !== "string" || !password) {
      return badRequest("Missing password");
    }

    const email = normalizeEmail(emailRaw);
    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);
    const iosClient = isIosClient(req);

    const ipAllowed = await isRateLimitAllowed(`ip:${ip}:sign_up`, 60, 10);
    const emailAllowed = await isRateLimitAllowed(
      `email:${email}:sign_up`,
      300,
      5
    );

    if (!ipAllowed || !emailAllowed) {
      await audit("SIGN_UP_RATE_LIMITED", null, req, {
        email,
        androidClient,
        iosClient,
      });

      return tooManyRequests("Too many attempts. Try again soon.");
    }

    if (!isValidEmail(email)) {
      return badRequest("Invalid email");
    }

    if (password.length < 8) {
      return badRequest("Password must be at least 8 characters");
    }

    if (password.length > 200) {
      return badRequest("Password is too long");
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
        await audit("SIGN_UP_INTEGRITY_FAILED", null, req, {
          email,
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
        path: "/api/auth/sign-up",
        requestBody: rawBodyBuffer,
      });

      if (!integrity.ok) {
        await audit("SIGN_UP_IOS_APP_ATTEST_FAILED", null, req, {
          email,
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
      if (typeof captchaToken !== "string" || !captchaToken) {
        return badRequest("Captcha verification required");
      }

      const captchaOk = await verifyTurnstile(captchaToken, getClientIp(req));

      if (!captchaOk) {
        await audit("SIGN_UP_CAPTCHA_FAILED", null, req, { email });
        return forbidden("Captcha verification failed");
      }
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      console.error("SIGN_UP_EXIST_CHECK_FAILED", {
        message: existingError.message,
      });
      return serverError("Server error");
    }

    if (existing) {
      return jsonNoStore(
        { ok: false, error: "Email already in use" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        email_verified_at: null,
      })
      .select("id,email")
      .single();

    if (insertError || !user?.id) {
      console.error("SIGN_UP_USER_INSERT_FAILED", {
        message: insertError?.message ?? "Missing user after insert",
      });
      return badRequest("Sign up failed");
    }

    const userId = String(user.id);

    const { error: deleteError } = await supabaseAdmin
      .from("auth_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("purpose", "email_verify")
      .is("consumed_at", null);

    if (deleteError) {
      console.warn("SIGN_UP_DELETE_OLD_VERIFY_TOKENS_FAILED", {
        message: deleteError.message,
      });
    }

    const rawToken = generateToken(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAtIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await supabaseAdmin.from("auth_tokens").insert({
      user_id: userId,
      email,
      token_hash: tokenHash,
      purpose: "email_verify",
      expires_at: expiresAtIso,
      created_ip: getClientIp(req),
      created_ua: getUserAgent(req),
      data: {},
    });

    if (tokenError) {
      console.error("SIGN_UP_VERIFY_TOKEN_INSERT_FAILED", {
        message: tokenError.message,
      });

      const { error: rollbackError } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("id", userId);

      if (rollbackError) {
        console.error("SIGN_UP_ROLLBACK_DELETE_USER_FAILED", {
          message: rollbackError.message,
        });
      }

      return serverError("Could not create verification link");
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.error("SIGN_UP_MISSING_APP_URL");
      return serverError("Server error");
    }

    const confirmUrl = `${appUrl}/confirm?type=email-verify&token=${encodeURIComponent(
      rawToken
    )}`;

    const emailSent = await sendEmail({
      to: email,
      subject: "Confirm your ToneMender email",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4">
          <h2>Confirm your email</h2>
          <p>Tap to confirm your email and activate your ToneMender account:</p>
          <p>
            <a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">
              Confirm email
            </a>
          </p>
          <p style="color:#666;font-size:12px">This link expires in 1 hour.</p>
          <p style="color:#666;font-size:12px">If you didn’t request this, you can ignore this email.</p>
        </div>
      `,
    });

    if (!emailSent) {
      await audit("SIGN_UP_EMAIL_SEND_FAILED", userId, req, {
        email,
        androidClient,
        iosClient,
      });

      return jsonNoStore(
        {
          ok: false,
          error:
            "Account created, but we couldn't send the confirmation email. Please try again or use “Resend confirmation.”",
        },
        { status: 502 }
      );
    }

    await audit("SIGN_UP_CREATED", userId, req, {
      email,
      androidClient,
      iosClient,
    });

    return jsonNoStore({ ok: true, success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("SIGN_UP_ERROR", { message });

    return serverError("Server error");
  }
}