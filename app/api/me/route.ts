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

export async function GET(req: Request) {
  try {
    const raw = readCookie(req, SESSION_COOKIE);
    if (!raw) return jsonNoStore({ user: null });

    const hash = sha256Hex(raw);

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("sessions")
      .select("user_id,expires_at")
      .eq("session_token_hash", hash)
      .maybeSingle();

    if (sessionErr || !session) return jsonNoStore({ user: null });

    const exp = new Date(session.expires_at).getTime();
    if (Number.isNaN(exp) || exp < Date.now()) {
      try {
        await supabaseAdmin.from("sessions").delete().eq("session_token_hash", hash);
      } catch {}
      return jsonNoStore({ user: null });
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email,is_pro,plan_type")
      .eq("id", session.user_id)
      .maybeSingle();

    if (userErr || !user) return jsonNoStore({ user: null });

    return jsonNoStore({
      user: { id: user.id, email: user.email, isPro: user.is_pro, planType: user.plan_type },
    });
  } catch (err) {
    console.error("ME ROUTE ERROR:", err);
    return jsonNoStore({ user: null });
  }
}