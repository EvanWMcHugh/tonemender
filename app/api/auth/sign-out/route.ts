import { jsonNoStore } from "@/lib/api/responses";
import { SESSION_COOKIE, buildClearedSessionCookie, getSessionCookie } from "@/lib/auth/cookies";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getClientPlatform, getUserAgent } from "@/lib/request/client-meta";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

function isAndroidClient(req: Request): boolean {
  return getClientPlatform(req) === "android";
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

async function audit(
  event: string,
  req: Request,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: null,
      event,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      meta,
    });
  } catch {}
}

export async function POST(req: Request) {
  const nowIso = new Date().toISOString();

  try {
    const rawSessionToken = getSessionCookie(req);

    if (rawSessionToken) {
      const sessionTokenHash = sha256Hex(rawSessionToken);

      const { error: revokeError } = await supabaseAdmin
        .from("sessions")
        .update({ revoked_at: nowIso })
        .eq("session_token_hash", sessionTokenHash)
        .is("revoked_at", null);

      if (revokeError) {
        const { error: deleteError } = await supabaseAdmin
          .from("sessions")
          .delete()
          .eq("session_token_hash", sessionTokenHash);

        if (deleteError) {
          console.warn("SIGN_OUT_SESSION_CLEANUP_FAILED", {
            revokeMessage: revokeError.message,
            deleteMessage: deleteError.message,
          });
        }
      }
    }

    await audit("SIGN_OUT_OK", req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.warn("SIGN_OUT_CLEANUP_WARNING", { message });
  }

  const res = jsonNoStore({ ok: true });

  const cookieDomain = isAndroidClient(req) ? undefined : getCookieDomain(req);

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
}