import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearSessionCookie(res: NextResponse) {
  // Clear cookie (httpOnly cookie clearing still works via Set-Cookie)
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
  );
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

    if (sessionErr || !session) {
      const res = jsonNoStore({ user: null });
      clearSessionCookie(res);
      return res;
    }

    const exp = new Date(session.expires_at).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) {
      try {
        await supabaseAdmin.from("sessions").delete().eq("session_token_hash", hash);
      } catch {}

      const res = jsonNoStore({ user: null });
      clearSessionCookie(res);
      return res;
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email,is_pro,plan_type")
      .eq("id", session.user_id)
      .maybeSingle();

    if (userErr || !user) {
      const res = jsonNoStore({ user: null });
      clearSessionCookie(res);
      return res;
    }

    return jsonNoStore({
      user: {
        id: user.id,
        email: user.email,
        isPro: user.is_pro,
        planType: user.plan_type,
      },
    });
  } catch (err) {
    console.error("ME ROUTE ERROR:", err);
    return jsonNoStore({ user: null });
  }
}