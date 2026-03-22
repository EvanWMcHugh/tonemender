import { badRequest, jsonNoStore, serverError, tooManyRequests, unauthorized } from "@/lib/api/responses";
import { buildClearedSessionCookie } from "@/lib/auth/cookies";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getClientPlatform, getUserAgent } from "@/lib/request/client-meta";
import { verifyIosAppAttestAssertion } from "@/lib/security/app-attest";
import { verifyAndroidPlayIntegrity } from "@/lib/security/play-integrity";
import { verifyTurnstile } from "@/lib/security/turnstile";

export const runtime = "nodejs";

const ANDROID_PACKAGE_NAME =
  process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.tonemender.app";

type DeleteAccountBody = {
  turnstileToken?: unknown;
  integrityToken?: unknown;
  integrityRequestHash?: unknown;
};

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
    const rawText = await req.text();
    const rawBodyBuffer = Buffer.from(rawText, "utf8");

    let body: DeleteAccountBody = {};

    try {
      body = rawText ? (JSON.parse(rawText) as DeleteAccountBody) : {};
    } catch {
      return badRequest("Invalid request body");
    }

    const { turnstileToken, integrityToken, integrityRequestHash } = body;

    const ip = getClientIp(req) || "unknown";
    const androidClient = isAndroidClient(req);
    const iosClient = isIosClient(req);

    const ipAllowed = await isRateLimitAllowed(`ip:${ip}:delete_account`, 60, 10);
    if (!ipAllowed) {
      return tooManyRequests("Too many attempts. Try again soon.");
    }

    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }

    const userAllowed = await isRateLimitAllowed(
      `user:${authUser.id}:delete_account`,
      300,
      5
    );

    if (!userAllowed) {
      return tooManyRequests("Too many attempts. Try again soon.");
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
        await audit("ACCOUNT_DELETE_INTEGRITY_FAILED", authUser.id, req, {
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
        path: "/api/user/delete-account",
        requestBody: rawBodyBuffer,
      });

      if (!integrity.ok) {
        await audit("ACCOUNT_DELETE_IOS_APP_ATTEST_FAILED", authUser.id, req, {
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
        await audit("ACCOUNT_DELETE_CAPTCHA_FAILED", authUser.id, req);
        return badRequest("Captcha failed");
      }
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("id,email,stripe_customer_id,stripe_subscription_id,plan_type")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userError || !userRow) {
      return serverError("User lookup failed");
    }

    await audit("ACCOUNT_DELETE_STARTED", authUser.id, req, {
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
      plan_type: userRow.plan_type ?? null,
      androidClient,
      iosClient,
    });

    const { error: sessionsError } = await supabaseAdmin
      .from("sessions")
      .delete()
      .eq("user_id", authUser.id);

    if (sessionsError) {
      console.error("DELETE_ACCOUNT_SESSIONS_DELETE_FAILED", {
        message: sessionsError.message,
      });
      return serverError("Failed to delete account");
    }

    const { error: authTokensError } = await supabaseAdmin
      .from("auth_tokens")
      .delete()
      .eq("user_id", authUser.id);

    if (authTokensError) {
      console.error("DELETE_ACCOUNT_AUTH_TOKENS_DELETE_FAILED", {
        message: authTokensError.message,
      });
      return serverError("Failed to delete account");
    }

    const { error: messagesError } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", authUser.id);

    if (messagesError) {
      console.error("DELETE_ACCOUNT_MESSAGES_DELETE_FAILED", {
        message: messagesError.message,
      });
      return serverError("Failed to delete account");
    }

    const { error: rewriteUsageError } = await supabaseAdmin
      .from("rewrite_usage")
      .delete()
      .eq("user_id", authUser.id);

    if (rewriteUsageError) {
      console.error("DELETE_ACCOUNT_REWRITE_USAGE_DELETE_FAILED", {
        message: rewriteUsageError.message,
      });
      return serverError("Failed to delete account");
    }

    const { error: profilesError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("user_id", authUser.id);

    if (profilesError) {
      console.error("DELETE_ACCOUNT_PROFILES_DELETE_FAILED", {
        message: profilesError.message,
      });
      return serverError("Failed to delete account");
    }

    const { error: auditNullError } = await supabaseAdmin
      .from("audit_log")
      .update({ user_id: null })
      .eq("user_id", authUser.id);

    if (auditNullError) {
      console.error("DELETE_ACCOUNT_AUDIT_LOG_NULL_OUT_FAILED", {
        message: auditNullError.message,
      });
      return serverError("Failed to delete account");
    }

    const { error: userDeleteError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", authUser.id);

    if (userDeleteError) {
      console.error("DELETE_ACCOUNT_USER_DELETE_FAILED", {
        message: userDeleteError.message,
      });
      return serverError("Failed to delete account");
    }

    await audit("ACCOUNT_DELETED", null, req, {
      deleted_user_id: authUser.id,
      deleted_email: userRow.email ?? null,
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
      plan_type: userRow.plan_type ?? null,
      androidClient,
      iosClient,
    });

    const res = jsonNoStore({
      ok: true,
      success: true,
    });

    const cookieDomain =
      androidClient || iosClient ? undefined : getCookieDomain(req);

    res.headers.append(
      "Set-Cookie",
      buildClearedSessionCookie({
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      })
    );

    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("DELETE_ACCOUNT_ROUTE_ERROR", { message });

    return serverError("Server error while deleting account");
  }
}