import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const SESSION_COOKIE = "tm_session";

const TIMEZONE = "America/Los_Angeles";
const DAILY_FREE_LIMIT = 3;
const MAX_MESSAGE_CHARS = 2000;

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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

/**
 * Rate limiter using your rate_limits table.
 * fail-open: if DB errors, we allow.
 */
async function rateLimitHit(key: string, windowSeconds: number, limit: number) {
  try {
    const now = Date.now();
    const windowStartSeconds = Math.floor(now / 1000 / windowSeconds) * windowSeconds;
    const windowStartIso = new Date(windowStartSeconds * 1000).toISOString();

    const { data: row } = await supabaseAdmin
      .from("rate_limits")
      .select("count")
      .eq("key", key)
      .eq("window_start", windowStartIso)
      .eq("window_seconds", windowSeconds)
      .maybeSingle();

    if (!row) {
      const { error: insErr } = await supabaseAdmin.from("rate_limits").insert({
        key,
        window_start: windowStartIso,
        window_seconds: windowSeconds,
        count: 1,
      });
      return !insErr;
    }

    const next = (row.count ?? 0) + 1;
    const { error: updErr } = await supabaseAdmin
      .from("rate_limits")
      .update({ count: next })
      .eq("key", key)
      .eq("window_start", windowStartIso)
      .eq("window_seconds", windowSeconds);

    if (updErr) return true; // fail-open
    return next <= limit;
  } catch {
    return true; // fail-open
  }
}

/**
 * Get timezone offset minutes for a given date in a given IANA timezone.
 * Uses timeZoneName: "shortOffset" → e.g., "GMT-8"
 */
function getTzOffsetMinutes(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
  // tz looks like "GMT-8" or "GMT+1"
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = parseInt(m[2], 10);
  const mm = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (hh * 60 + mm);
}

function formatLA_YYYY_MM_DD(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // YYYY-MM-DD
}

/**
 * Compute [startUtcIso, endUtcIso) for "today in LA".
 * Handles DST by computing offsets at start and end instants separately.
 */
function laDayBoundsUtcIso(date = new Date()) {
  const ymd = formatLA_YYYY_MM_DD(date); // YYYY-MM-DD
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));

  // Start of day "LA local", represented as if it were UTC then corrected by offset.
  const startLocalAsUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const startOffsetMin = getTzOffsetMinutes(TIMEZONE, startLocalAsUtc);
  const startUtc = new Date(startLocalAsUtc.getTime() - startOffsetMin * 60_000);

  // Next day
  const endLocalAsUtc = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  const endOffsetMin = getTzOffsetMinutes(TIMEZONE, endLocalAsUtc);
  const endUtc = new Date(endLocalAsUtc.getTime() - endOffsetMin * 60_000);

  return [startUtc.toISOString(), endUtc.toISOString()] as const;
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

function extractBlock(raw: string, label: string): string {
  const regex = new RegExp(
    `(^|\\n)${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z_]+\\s*:|$)`,
    "i"
  );
  const match = raw.match(regex);
  return match ? match[2].trim() : "";
}

export async function POST(req: Request) {
  try {
    // ---- auth (cookie session) ----
    const userId = await getUserIdFromSession(req);
    if (!userId) return jsonNoStore({ error: "Unauthorized" }, { status: 401 });

    // ---- optional rate limit (per-user + per-IP) ----
    const ip = getClientIp(req) || "unknown";
    const okUser = await rateLimitHit(`user:${userId}:rewrite`, 60, 30); // 30/min
    const okIp = await rateLimitHit(`ip:${ip}:rewrite`, 60, 60); // 60/min
    if (!okUser || !okIp) return jsonNoStore({ error: "Too many requests" }, { status: 429 });

    // ---- load user (pro + lifecycle checks) ----
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,email,is_pro,plan_type,disabled_at,deleted_at")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !user) return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    if (user.disabled_at || user.deleted_at) return jsonNoStore({ error: "Account unavailable" }, { status: 403 });

    // ---- parse body ----
    const body = await req.json().catch(() => ({}));
    const messageRaw = body?.message;
    const recipient = body?.recipient;
    const tone = body?.tone;

    if (typeof messageRaw !== "string") return jsonNoStore({ error: "Message is required" }, { status: 400 });

    const trimmedMessage = messageRaw.trim();
    if (!trimmedMessage) return jsonNoStore({ error: "Message is required" }, { status: 400 });
    if (trimmedMessage.length > MAX_MESSAGE_CHARS) {
      return jsonNoStore({ error: `Message is too long (max ${MAX_MESSAGE_CHARS} characters)` }, { status: 413 });
    }

    // ---- enforce free daily limit (LA day) ----
    if (!user.is_pro) {
      const [startIso, endIso] = laDayBoundsUtcIso(new Date());

      const { count, error: countErr } = await supabaseAdmin
        .from("rewrite_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startIso)
        .lt("created_at", endIso);

      if (countErr) return jsonNoStore({ error: "Usage check failed" }, { status: 500 });

      const usedToday = count ?? 0;
      if (usedToday >= DAILY_FREE_LIMIT) {
        await audit("REWRITE_LIMIT_BLOCKED", userId, req, { usedToday, limit: DAILY_FREE_LIMIT });
        return jsonNoStore({ error: "Daily limit reached" }, { status: 429 });
      }
    }

    // ---- recipient/tone mapping ----
    const recipientDescription = (() => {
      switch (recipient) {
        case "partner":
          return "a romantic partner you care about and want to keep a healthy, vulnerable connection with";
        case "friend":
          return "a friend you want to stay close with while being honest";
        case "family":
          return "a family member where you want less drama and more understanding";
        case "coworker":
          return "a coworker or manager where you need to stay professional but honest";
        default:
          return "someone you care about and want to communicate with in a healthy, respectful way";
      }
    })();

    const primaryToneHint =
      tone === "soft"
        ? "The user's preferred tone is SOFT — extra gentle and emotionally safe."
        : tone === "calm"
        ? "The user's preferred tone is CALM — neutral and grounded."
        : tone === "clear"
        ? "The user's preferred tone is CLEAR — direct but respectful."
        : "";

    const prompt = `
You are an expert communication and relationship coach. Rewrite the user's message into healthier versions and analyze emotional tone.

User context:
- Recipient: ${recipientDescription}
${primaryToneHint}

Your tasks:

1️⃣ REWRITE the message into three tones:
SOFT — gentle, empathetic, emotionally safe
CALM — neutral, steady, grounded
CLEAR — direct but respectful

2️⃣ SCORE THE ORIGINAL MESSAGE
Give a "Tone Score" from **0–100**, where:
0 = extremely harsh / risky
100 = very healthy and clear
The score MUST be just a number.

3️⃣ EMOTIONAL IMPACT PREDICTION
Predict in **1–2 natural sentences** how the *rewritten* message is likely to make the recipient feel.
Use emojis to enhance the emotional meaning (😊😟😬❤️ etc.).

Original message:
"${trimmedMessage}"

Return EXACTLY in this format:

SOFT: <soft message>
CALM: <calm message>
CLEAR: <clear message>
TONE_SCORE: <0-100 only>
EMOTION_IMPACT: <emoji-enhanced 1–2 sentence prediction>
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const raw = (completion.choices?.[0]?.message?.content ?? "").trim();
    if (!raw) return jsonNoStore({ error: "AI response was empty. Please try again." }, { status: 502 });

    const soft = extractBlock(raw, "SOFT");
    const calm = extractBlock(raw, "CALM");
    const clear = extractBlock(raw, "CLEAR");
    const toneScoreRaw = extractBlock(raw, "TONE_SCORE");
    const emotionImpact = extractBlock(raw, "EMOTION_IMPACT");

    let tone_score = Number.parseInt(String(toneScoreRaw).trim(), 10);
    if (!Number.isFinite(tone_score)) tone_score = 0;
    tone_score = Math.max(0, Math.min(100, tone_score));

    // ---- log usage (best-effort, but important) ----
    try {
      await supabaseAdmin.from("rewrite_usage").insert({ user_id: userId });
    } catch (e) {
      // If insert fails, we still return the rewrite (fail-open).
      // You can flip this to fail-closed if you want strict metering.
      console.warn("rewrite_usage insert failed:", e);
    }

    await audit("REWRITE_OK", userId, req, { is_pro: Boolean(user.is_pro) });

    return jsonNoStore({
      soft,
      calm,
      clear,
      tone_score,
      emotion_prediction: emotionImpact,
      // helpful for UI
      is_pro: Boolean(user.is_pro),
      day: formatLA_YYYY_MM_DD(new Date()),
      free_limit: DAILY_FREE_LIMIT,
    });
  } catch (err) {
    console.error("REWRITE ERROR:", err);
    return jsonNoStore({ error: "Server error while rewriting message" }, { status: 500 });
  }
}