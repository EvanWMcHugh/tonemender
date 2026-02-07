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

export async function POST(req: Request) {
  try {
    const raw = readCookie(req, SESSION_COOKIE);

    if (raw) {
      const hash = sha256Hex(raw);
      await supabaseAdmin
        .from("sessions")
        .delete()
        .eq("session_token_hash", hash);
    }
  } catch (err) {
    // Best-effort logout: never block client
    console.warn("SIGN OUT CLEANUP WARNING:", err);
  }

  const res = jsonNoStore({ ok: true });

  // Clear cookie
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return res;
}