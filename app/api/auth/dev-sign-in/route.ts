import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";

// TEMPORARY: lock this down hard.
const DEV_BYPASS_ENABLED = process.env.ENABLE_ANDROID_DEV_SIGN_IN === "true";
const ALLOWED_EMAILS = new Set(
  (process.env.ANDROID_DEV_SIGN_IN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const SESSION_COOKIE_NAME = "tm_session";
const SESSION_TTL_DAYS = 30;

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(req: NextRequest) {
  if (!DEV_BYPASS_ENABLED) {
    return jsonNoStore({ error: "Not found" }, { status: 404 });
  }

  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return jsonNoStore({ error: "Email is required." }, { status: 400 });
  }

  if (!ALLOWED_EMAILS.has(email)) {
    return jsonNoStore({ error: "Forbidden." }, { status: 403 });
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, email, is_pro, plan_type")
    .eq("email", email)
    .maybeSingle();

  if (userError) {
    return jsonNoStore({ error: "Failed to load user." }, { status: 500 });
  }

  if (!user) {
    return jsonNoStore({ error: "User not found." }, { status: 404 });
  }

  const rawSessionToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(rawSessionToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  const { error: sessionError } = await supabaseAdmin.from("sessions").insert({
    user_id: user.id,
    token_hash: tokenHash, // if your column has a different name, change this
    expires_at: expiresAt.toISOString(),
  });

  if (sessionError) {
    return jsonNoStore({ error: "Failed to create session." }, { status: 500 });
  }

  const res = jsonNoStore({
    user: {
      id: user.id,
      email: user.email,
      isPro: !!user.is_pro,
      planType: user.plan_type ?? null,
    },
  });

  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: rawSessionToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return res;
}