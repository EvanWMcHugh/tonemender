import { jsonNoStore, serverError } from "@/lib/api/responses";
import { buildClearedSessionCookie, getSessionCookie } from "@/lib/auth/cookies";
import {
  getReviewerMode,
  isFreeReviewer,
  isProReviewer,
  isReviewerEmail,
} from "@/lib/auth/reviewers";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientPlatform } from "@/lib/request/client-meta";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

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

function isNativeClient(req: Request): boolean {
  const platform = getClientPlatform(req);
  return platform === "android" || platform === "ios";
}

function appendClearedSessionCookie(req: Request, res: Response): void {
  const cookieDomain = isNativeClient(req) ? undefined : getCookieDomain(req);

  res.headers.append(
    "Set-Cookie",
    buildClearedSessionCookie({
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    })
  );
}

export async function GET(req: Request) {
  try {
    const rawSessionToken = getSessionCookie(req);

    if (!rawSessionToken) {
      return jsonNoStore({ user: null });
    }

    const sessionTokenHash = sha256Hex(rawSessionToken);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select("user_id,expires_at,revoked_at")
      .eq("session_token_hash", sessionTokenHash)
      .maybeSingle();

    if (sessionError) {
      return serverError("Server error");
    }

    if (!session?.user_id) {
      const res = jsonNoStore({ user: null });
      appendClearedSessionCookie(req, res);
      return res;
    }

    const expiresMs = session.expires_at
      ? new Date(session.expires_at).getTime()
      : 0;

    if (session.revoked_at || !session.expires_at || expiresMs <= nowMs) {
      const { error: revokeError } = await supabaseAdmin
        .from("sessions")
        .update({ revoked_at: session.revoked_at ?? nowIso })
        .eq("session_token_hash", sessionTokenHash);

      if (revokeError) {
        console.warn("USER_ME_REVOKE_SESSION_FAILED", {
          message: revokeError.message,
        });
      }

      const res = jsonNoStore({ user: null });
      appendClearedSessionCookie(req, res);
      return res;
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id,email,is_pro,plan_type,disabled_at,deleted_at")
      .eq("id", session.user_id)
      .maybeSingle();

    if (userError) {
      return serverError("Server error");
    }

    if (!user || user.disabled_at || user.deleted_at) {
      const res = jsonNoStore({ user: null });
      appendClearedSessionCookie(req, res);
      return res;
    }

    const { error: updateError } = await supabaseAdmin
      .from("sessions")
      .update({ last_seen_at: nowIso })
      .eq("session_token_hash", sessionTokenHash)
      .is("revoked_at", null);

    if (updateError) {
      console.warn("USER_ME_LAST_SEEN_UPDATE_FAILED", {
        message: updateError.message,
      });
    }

    const email = String(user.email).trim().toLowerCase();
    const reviewerMode = getReviewerMode(email);
    const isReviewer = isReviewerEmail(email);

    let isPro = Boolean(user.is_pro);
    let planType = user.plan_type ?? null;

    if (isProReviewer(email)) {
      isPro = true;
      planType = "reviewer";
    } else if (isFreeReviewer(email)) {
      isPro = false;
      planType = null;
    }

    return jsonNoStore({
      ok: true,
      user: {
        id: String(user.id),
        email,
        isPro,
        planType,
        isReviewer,
        reviewerMode,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("USER_ME_ERROR", { message });

    return serverError("Server error");
  }
}