import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import bcrypt from "bcryptjs";
import { sha256Hex } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function cryptoRandomHex(bytes: number) {
  const crypto = require("crypto") as typeof import("crypto");
  return crypto.randomBytes(bytes).toString("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;
    const password = body?.password;
    const captchaToken = body?.captchaToken;

    if (!emailRaw || typeof emailRaw !== "string") {
      return jsonNoStore({ error: "Missing email" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return jsonNoStore({ error: "Missing password" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    // ✅ Captcha enforcement handled centrally (supports "bypass" internally)
    if (!captchaToken || typeof captchaToken !== "string") {
      return jsonNoStore({ error: "Captcha verification required" }, { status: 400 });
    }

    const okCaptcha = await verifyTurnstile(captchaToken, getClientIp(req));
    if (!okCaptcha) {
      return jsonNoStore({ error: "Captcha verification failed" }, { status: 403 });
    }

    // ✅ Custom users table lookup (prefer exact match if stored normalized lowercase)
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id,email,password_hash,email_verified_at,is_pro,plan_type")
      .eq("email", email)
      .maybeSingle();

    if (error) return jsonNoStore({ error: "Server error" }, { status: 500 });

    if (!user) return jsonNoStore({ error: "Invalid email or password" }, { status: 401 });

    if (!user.email_verified_at) {
      return jsonNoStore({ error: "Email not confirmed" }, { status: 403 });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return jsonNoStore({ error: "Invalid email or password" }, { status: 401 });

    // ✅ Create session (raw token in cookie, hash in DB)
    const rawSession = cryptoRandomHex(32);
    const sessionHash = sha256Hex(rawSession);

    const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 days
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();

    const { error: sErr } = await supabaseAdmin.from("sessions").insert({
      user_id: user.id,
      session_token_hash: sessionHash,
      expires_at: expiresAt,
    });

    if (sErr) return jsonNoStore({ error: "Failed to create session" }, { status: 500 });

    const res = jsonNoStore({
      ok: true,
      user: { id: user.id, email: user.email, isPro: user.is_pro, planType: user.plan_type },
    });

    res.cookies.set(SESSION_COOKIE, rawSession, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: maxAgeSeconds,
    });

    return res;
  } catch (e: any) {
    console.error("SIGN IN ERROR:", e);
    return jsonNoStore({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}