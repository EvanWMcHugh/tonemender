import { NextResponse } from "next/server";
import OpenAI from "openai";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const TIMEZONE = "America/Los_Angeles";
const DAILY_FREE_LIMIT = 3;
const MAX_MESSAGE_CHARS = 2000;

type RewriteTone = "soft" | "calm" | "clear" | null;
type RewriteRecipient = "partner" | "friend" | "family" | "coworker" | null;

type RewriteRequestBody = {
  message?: unknown;
  recipient?: unknown;
  tone?: unknown;
};

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}

function formatLA_YYYY_MM_DD(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTzOffsetMinutes(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const tzName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);

  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;

  return sign * (hours * 60 + minutes);
}

function laDayBoundsUtcIso(date = new Date()) {
  const ymd = formatLA_YYYY_MM_DD(date);
  const [year, month, day] = ymd.split("-").map((value) => parseInt(value, 10));

  const startLocalAsUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const startOffsetMinutes = getTzOffsetMinutes(TIMEZONE, startLocalAsUtc);
  const startUtc = new Date(startLocalAsUtc.getTime() - startOffsetMinutes * 60_000);

  const endLocalAsUtc = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const endOffsetMinutes = getTzOffsetMinutes(TIMEZONE, endLocalAsUtc);
  const endUtc = new Date(endLocalAsUtc.getTime() - endOffsetMinutes * 60_000);

  return [startUtc.toISOString(), endUtc.toISOString()] as const;
}

function extractBlock(raw: string, label: string): string {
  const regex = new RegExp(
    `(^|\\n)${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z_]+\\s*:|$)`,
    "i"
  );
  const match = raw.match(regex);
  return match ? match[2].trim() : "";
}

function parseRecipient(value: unknown): RewriteRecipient {
  if (value === "partner" || value === "friend" || value === "family" || value === "coworker") {
    return value;
  }
  return null;
}

function parseTone(value: unknown): RewriteTone {
  if (value === "soft" || value === "calm" || value === "clear") {
    return value;
  }
  return null;
}

function recipientDescription(recipient: RewriteRecipient) {
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
}

function toneHint(tone: RewriteTone) {
  if (tone === "soft") {
    return "The user's preferred tone is SOFT — extra gentle and emotionally safe.";
  }
  if (tone === "calm") {
    return "The user's preferred tone is CALM — neutral and grounded.";
  }
  if (tone === "clear") {
    return "The user's preferred tone is CLEAR — direct but respectful.";
  }
  return "";
}

async function audit(
  event: string,
  userId: string | null,
  req: Request,
  meta: Record<string, unknown> = {}
) {
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
      const { error: insertError } = await supabaseAdmin.from("rate_limits").insert({
        key,
        window_start: windowStartIso,
        window_seconds: windowSeconds,
        count: 1,
      });

      return !insertError;
    }

    const nextCount = (row.count ?? 0) + 1;

    const { error: updateError } = await supabaseAdmin
      .from("rate_limits")
      .update({ count: nextCount })
      .eq("key", key)
      .eq("window_start", windowStartIso)
      .eq("window_seconds", windowSeconds);

    if (updateError) return true;
    return nextCount <= limit;
  } catch {
    return true;
  }
}

async function getUsedToday(userId: string) {
  const [startIso, endIso] = laDayBoundsUtcIso(new Date());

  const { count, error } = await supabaseAdmin
    .from("rewrite_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) {
    throw new Error("Usage check failed");
  }

  return count ?? 0;
}

async function recordUsage(userId: string) {
  const { error } = await supabaseAdmin.from("rewrite_usage").insert({ user_id: userId });

  if (error) {
    throw new Error("Failed to record rewrite usage");
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req) || "unknown";
    const okUserRate = await rateLimitHit(`user:${authUser.id}:rewrite`, 60, 30);
    const okIpRate = await rateLimitHit(`ip:${ip}:rewrite`, 60, 60);

    if (!okUserRate || !okIpRate) {
      return jsonNoStore({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await req.json().catch(() => ({}))) as RewriteRequestBody;

    const messageRaw = body.message;
    const recipient = parseRecipient(body.recipient);
    const tone = parseTone(body.tone);

    if (typeof messageRaw !== "string") {
      return jsonNoStore({ error: "Message is required" }, { status: 400 });
    }

    const trimmedMessage = messageRaw.trim();

    if (!trimmedMessage) {
      return jsonNoStore({ error: "Message is required" }, { status: 400 });
    }

    if (trimmedMessage.length > MAX_MESSAGE_CHARS) {
      return jsonNoStore(
        { error: `Message is too long (max ${MAX_MESSAGE_CHARS} characters)` },
        { status: 413 }
      );
    }

    if (!authUser.isPro) {
      const usedToday = await getUsedToday(authUser.id);

      if (usedToday >= DAILY_FREE_LIMIT) {
        await audit("REWRITE_LIMIT_BLOCKED", authUser.id, req, {
          usedToday,
          limit: DAILY_FREE_LIMIT,
        });

        return jsonNoStore({ error: "Daily limit reached" }, { status: 429 });
      }
    }

    const prompt = `
You are an expert communication and relationship coach. Rewrite the user's message into healthier versions and analyze emotional tone.

User context:
- Recipient: ${recipientDescription(recipient)}
${toneHint(tone)}

Your tasks:

1️⃣ REWRITE the message into three tones:
SOFT — gentle, empathetic, emotionally safe
CALM — neutral, steady, grounded
CLEAR — direct but respectful

2️⃣ SCORE THE ORIGINAL MESSAGE
Give a "Tone Score" from 0–100, where:
0 = extremely harsh / risky
100 = very healthy and clear
The score MUST be just a number.

3️⃣ EMOTIONAL IMPACT PREDICTION
Predict in 1–2 natural sentences how the rewritten message is likely to make the recipient feel.
Use emojis to enhance the emotional meaning.

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

    if (!raw) {
      return jsonNoStore(
        { error: "AI response was empty. Please try again." },
        { status: 502 }
      );
    }

    const soft = extractBlock(raw, "SOFT");
    const calm = extractBlock(raw, "CALM");
    const clear = extractBlock(raw, "CLEAR");
    const toneScoreRaw = extractBlock(raw, "TONE_SCORE");
    const emotionImpact = extractBlock(raw, "EMOTION_IMPACT");

    let toneScore = Number.parseInt(String(toneScoreRaw).trim(), 10);
    if (!Number.isFinite(toneScore)) toneScore = 0;
    toneScore = Math.max(0, Math.min(100, toneScore));

    await recordUsage(authUser.id);

    await audit("REWRITE_OK", authUser.id, req, {
      is_pro: authUser.isPro,
    });

    const usedTodayAfter = authUser.isPro ? null : await getUsedToday(authUser.id);

    return jsonNoStore({
      soft,
      calm,
      clear,
      tone_score: toneScore,
      emotion_prediction: emotionImpact,
      is_pro: authUser.isPro,
      plan_type: authUser.planType,
      day: formatLA_YYYY_MM_DD(new Date()),
      free_limit: DAILY_FREE_LIMIT,
      rewrites_today: usedTodayAfter,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Server error while rewriting message";

    if (message === "Usage check failed") {
      return jsonNoStore({ error: message }, { status: 500 });
    }

    if (message === "Failed to record rewrite usage") {
      return jsonNoStore({ error: message }, { status: 500 });
    }

    return jsonNoStore(
      { error: "Server error while rewriting message" },
      { status: 500 }
    );
  }
}