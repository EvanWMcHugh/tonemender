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
    // cleanup expired session
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

    if (!userId) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user for optional external reconciliation (Stripe IDs stored on users now)
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("stripe_customer_id, plan_type")
      .eq("id", userId)
      .maybeSingle();

    // Best-effort deletes (don’t let one failure block)
    try {
      await supabaseAdmin.from("messages").delete().eq("user_id", userId);
    } catch {}

    try {
      await supabaseAdmin.from("rewrite_usage").delete().eq("user_id", userId);
    } catch {}

    try {
      await supabaseAdmin.from("email_verification_tokens").delete().eq("user_id", userId);
    } catch {}

    try {
      await supabaseAdmin.from("password_reset_tokens").delete().eq("user_id", userId);
    } catch {}

    try {
      await supabaseAdmin.from("email_change_requests").delete().eq("user_id", userId);
    } catch {}

    try {
      await supabaseAdmin.from("sessions").delete().eq("user_id", userId);
    } catch {}

    // Finally delete the user row
    const { error: delErr } = await supabaseAdmin.from("users").delete().eq("id", userId);

    if (delErr) {
      return jsonNoStore({ error: delErr.message }, { status: 500 });
    }

    // Clear session cookie
    const res = jsonNoStore({
      ok: true,
      success: true,
      stripe_customer_id: userRow?.stripe_customer_id ?? null,
      plan_type: userRow?.plan_type ?? null,
    });

    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (err) {
    console.error("DELETE ACCOUNT ERROR:", err);
    return jsonNoStore({ error: "Server error while deleting account" }, { status: 500 });
  }
}