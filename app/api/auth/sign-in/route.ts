import bcrypt from "bcryptjs";

import {
  jsonNoStore,
  badRequest,
  forbidden,
  serverError,
  tooManyRequests,
  unauthorized,
} from "@/lib/api/responses";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import {
  getReviewerMode,
  isFreeReviewer,
  isProReviewer,
  isReviewerEmail,
} from "@/lib/auth/reviewers";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
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

type SignInBody = {
  email?: unknown;
  password?: unknown;
  captchaToken?: unknown;
  integrityToken?: unknown;
  integrityRequestHash?: unknown;
  deviceName?: unknown;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getCookieDomain(req: Request): string | undefined {
  const host = req.headers.get("host") || "";

  if (
    host === "tonemender.com" ||
    host === "www.tonemender.com" ||
    host.endsWith(".tonemender.com")
  ) {
    return ".tonemender.com";
  }

  return undefined;
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
    const { error: insertError } = await supabaseAdmin.from("rate_limits").insert({
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

export async function POST(req: Request) {
  try {
    const rawTextOriginal = await req.text();
    const rawText = sanitizeJsonText(rawTextOriginal);
    const rawBodyBuffer = Buffer.from(rawText, "utf8");

    let body: SignInBody = {};

    try {
      body = rawText ? (JSON.parse(rawText) as SignInBody) : {};
    } catch {
      return badRequest("Invalid request body");
    }

    const emailRaw = body.email;
    const password = body.password;
    const captchaToken = body.captchaToken;
    const integrityToken = body.integrityToken;
    const integrityRequestHash = body.integrityRequestHash;
    const deviceName = body.deviceName;

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
    const isReviewer = isReviewerEmail(email);

    const ipAllowed = await isRateLimitAllowed(`ip:${ip}:sign_in`, 60, 20);
    const emailAllowed = await isRateLimitAllowed(`email:${email}:sign_in`, 300, 10);

    if (!ipAllowed || !emailAllowed) {
      await audit("SIGN_IN_RATE_LIMITED", null, req, {
        email,
        androidClient,
        iosClient,
        isReviewer,
      });

      return tooManyRequests("Too many attempts. Try again soon.");
    }

    // Android integrity
    if (androidClient && !isReviewer) {
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
        await audit("SIGN_IN_INTEGRITY_FAILED", null, req, {
          email,
          reason: integrity.reason,
          payload: integrity.payload ?? null,
        });

        return jsonNoStore(
          {
            ok: false,
            error: integrity.publicMessage,
            reason: integrity.reason,
          },
          { status: 403 }
        );
      }
    }

    // iOS integrity
    else if (iosClient && !isReviewer) {
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
        path: "/api/auth/sign-in",
        requestBody: rawBodyBuffer,
      });

      if (!integrity.ok) {
        await audit("SIGN_IN_IOS_APP_ATTEST_FAILED", null, req, {
          email,
          reason: integrity.reason,
          payload: integrity.payload ?? null,
        });

        return jsonNoStore(
          {
            ok: false,
            error: integrity.publicMessage,
            reason: integrity.reason,
          },
          { status: 403 }
        );
      }
    }

    // Web captcha
    else if (!isReviewer) {
      if (typeof captchaToken !== "string" || !captchaToken) {
        return badRequest("Captcha verification required");
      }

      const captchaOk = await verifyTurnstile(captchaToken, getClientIp(req));

      if (!captchaOk) {
        await audit("SIGN_IN_CAPTCHA_FAILED", null, req, { email });
        return forbidden("Captcha verification failed");
      }
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select(
        "id,email,password_hash,email_verified_at,is_pro,plan_type,disabled_at,deleted_at"
      )
      .eq("email", email)
      .maybeSingle();

    if (error) return serverError("Server error");
    if (!user) return unauthorized("Invalid email or password");

    if (user.disabled_at || user.deleted_at) {
      return forbidden("Account unavailable");
    }

    if (!user.email_verified_at) {
      return jsonNoStore(
        {
          ok: false,
          error: "EMAIL_NOT_VERIFIED",
          message: "Email not confirmed",
        },
        { status: 403 }
      );
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) return unauthorized("Invalid email or password");

    const rawSessionToken = generateToken(32);
    const sessionTokenHash = sha256Hex(rawSessionToken);

    const maxAgeSeconds = 60 * 60 * 24 * 30;
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();

    await supabaseAdmin.from("sessions").insert({
      user_id: user.id,
      session_token_hash: sessionTokenHash,
      expires_at: expiresAt,
      last_seen_at: nowIso,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      device_name:
        typeof deviceName === "string" ? deviceName.slice(0, 200) : null,
    });

    await audit("SIGN_IN_OK", String(user.id), req, {
      androidClient,
      iosClient,
      isReviewer,
    });

    let isPro = Boolean(user.is_pro);
    let planType = user.plan_type ?? null;

    if (isProReviewer(email)) {
      isPro = true;
      planType = "reviewer";
    } else if (isFreeReviewer(email)) {
      isPro = false;
      planType = null;
    }

    const res = jsonNoStore({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        isPro,
        planType,
        isReviewer,
        reviewerMode: getReviewerMode(email),
      },
    });

    const cookieDomain =
      androidClient || iosClient ? undefined : getCookieDomain(req);

    res.cookies.set(SESSION_COOKIE, rawSessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: maxAgeSeconds,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("SIGN_IN_ERROR", { message });
    return serverError("Server error");
  }
}