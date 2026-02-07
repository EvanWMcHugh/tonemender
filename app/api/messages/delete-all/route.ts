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

async function getUserIdFromSession(req: Request) {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;

  const hash = sha256Hex(raw);

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (error || !session) return null;

  const exp = new Date(session.expires_at).getTime();
  if (Number.isNaN(exp) || exp < Date.now()) {
    try {
      await supabaseAdmin.from("sessions").delete().eq("session_token_hash", hash);
    } catch {}
    return null;
  }

  return session.user_id as string;
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromSession(req);
    if (!userId) return jsonNoStore({ error: "Not authenticated" }, { status: 401 });

    const { error } = await supabaseAdmin.from("messages").delete().eq("user_id", userId);
    if (error) return jsonNoStore({ error: "Failed to delete drafts" }, { status: 500 });

    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("DELETE ALL MESSAGES ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}