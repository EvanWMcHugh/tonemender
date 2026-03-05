import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
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

async function getUserIdFromSession(req: Request) {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;

  const hash = sha256Hex(raw);
  const nowIso = new Date().toISOString();

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at,revoked_at")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (error || !session?.user_id) return null;
  if (session.revoked_at) return null;
  if (!session.expires_at || session.expires_at <= nowIso) return null;

  // Best-effort last_seen_at
  try {
    await supabaseAdmin
      .from("sessions")
      .update({ last_seen_at: nowIso })
      .eq("session_token_hash", hash)
      .is("revoked_at", null);
  } catch {}

  return String(session.user_id);
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromSession(req);
    if (!userId) return jsonNoStore({ error: "Not authenticated" }, { status: 401 });

    const { error } = await supabaseAdmin.from("messages").delete().eq("user_id", userId);
    if (error) {
      await audit("DRAFTS_DELETE_ALL_FAILED", userId, req, {});
      return jsonNoStore({ error: "Failed to delete drafts" }, { status: 500 });
    }

    await audit("DRAFTS_DELETE_ALL_OK", userId, req, {});
    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("DELETE ALL MESSAGES ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}