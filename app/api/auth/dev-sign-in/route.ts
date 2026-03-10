import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/db/supabase-admin";

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
    return jsonNoStore(
      {
        error: "Failed to load user.",
        details: userError.message,
        code: userError.code,
        hint: userError.hint ?? null,
      },
      { status: 500 }
    );
  }

  if (!user) {
    return jsonNoStore({ error: "User not found." }, { status: 404 });
  }

  const rawSessionToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(rawSessionToken);

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || null;
  const userAgent = req.headers.get("user-agent");
  const deviceName = "Android Dev Bypass";

  const { error: sessionError } = await supabaseAdmin.from("sessions").insert({
    user_id: user.id,
    session_token_hash: tokenHash,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    last_seen_at: now.toISOString(),
    revoked_at: null,
    ip,
    user_agent: userAgent,
    device_name: deviceName,
  });

  if (sessionError) {
    return jsonNoStore(
      {
        error: "Failed to create session.",
        details: sessionError.message,
        code: sessionError.code,
        hint: sessionError.hint ?? null,
      },
      { status: 500 }
    );
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