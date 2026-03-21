import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { isFreeReviewer, isProReviewer } from "@/lib/auth/reviewers";
import { sha256Hex } from "@/lib/security/crypto";

const SESSION_COOKIE = "tm_session";
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));

  return match ? decodeURIComponent(match[1]) : null;
}

export type AuthUser = {
  id: string;
  email: string;
  isPro: boolean;
  planType: string | null;
};

export async function getAuthUserFromRequest(
  req: Request
): Promise<AuthUser | null> {
  const rawSessionToken = readCookie(req, SESSION_COOKIE);
  if (!rawSessionToken) return null;

  const sessionTokenHash = sha256Hex(rawSessionToken);

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("user_id, expires_at, revoked_at, last_seen_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionError || !session?.user_id) return null;
  if (session.revoked_at) return null;

  const expiresAtMs = session.expires_at
    ? new Date(session.expires_at).getTime()
    : 0;

  if (!expiresAtMs || expiresAtMs <= Date.now()) {
    return null;
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, email, is_pro, plan_type, disabled_at, deleted_at")
    .eq("id", session.user_id)
    .maybeSingle();

  if (userError || !user || user.disabled_at || user.deleted_at) {
    return null;
  }

  const email = String(user.email).trim().toLowerCase();
  let isPro = Boolean(user.is_pro);
  let planType = user.plan_type ?? null;

  if (isProReviewer(email)) {
    isPro = true;
    planType = "reviewer";
  } else if (isFreeReviewer(email)) {
    isPro = false;
    planType = null;
  }

  const lastSeenAtMs = session.last_seen_at
    ? new Date(session.last_seen_at).getTime()
    : 0;

  if (!lastSeenAtMs || Date.now() - lastSeenAtMs >= LAST_SEEN_UPDATE_INTERVAL_MS) {
    const { error: updateError } = await supabaseAdmin
      .from("sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("session_token_hash", sessionTokenHash)
      .is("revoked_at", null);

    if (updateError) {
      console.error("Failed to update session last_seen_at", {
        code: updateError.code,
        message: updateError.message,
      });
    }
  }

  return {
    id: String(user.id),
    email,
    isPro,
    planType,
  };
}