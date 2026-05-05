import OpenAI from "openai";

import {
  badRequest,
  jsonNoStore,
  serverError,
  tooManyRequests,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";

export const runtime = "nodejs";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("Missing OPENAI_API_KEY");
}

const openai = new OpenAI({ apiKey });

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function formatLA_YYYY_MM_DD(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTzOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const tzName =
    parts.find((part) => part.type === "timeZoneName")?.value || "GMT";

  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;

  return sign * (hours * 60 + minutes);
}

function laDayBoundsUtcIso(date = new Date()): readonly [string, string] {
  const ymd = formatLA_YYYY_MM_DD(date);
  const [year, month, day] = ymd
    .split("-")
    .map((value) => Number.parseInt(value, 10));

  const startLocalAsUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const startOffsetMinutes = getTzOffsetMinutes(TIMEZONE, startLocalAsUtc);
  const startUtc = new Date(
    startLocalAsUtc.getTime() - startOffsetMinutes * 60_000
  );

  const endLocalAsUtc = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const endOffsetMinutes = getTzOffsetMinutes(TIMEZONE, endLocalAsUtc);
  const endUtc = new Date(
    endLocalAsUtc.getTime() - endOffsetMinutes * 60_000
  );

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
  if (
    value === "partner" ||
    value === "friend" ||
    value === "family" ||
    value === "coworker"
  ) {
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

function recipientDescription(recipient: RewriteRecipient): string {
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

function toneHint(tone: RewriteTone): string {
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
): Promise<void> {
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

async function recordRewriteFailure(
  userId: string | null,
  req: Request,
  reason: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabaseAdmin.from("rewrite_failures").insert({
      user_id: userId,
      reason,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      meta,
    });
  } catch {}
}

async function isRateLimitAllowed(
  key: string,
  windowSeconds: number,
  limit: number
): Promise<boolean> {
  try {
    const now = Date.now();
    const windowStartSeconds =
      Math.floor(now / 1000 / windowSeconds) * windowSeconds;
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

async function getUsedToday(userId: string): Promise<number> {
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

async function recordUsage(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("rewrite_usage")
    .insert({ user_id: userId });

  if (error) {
    throw new Error("Failed to record rewrite usage");
  }
}

async function getFreeDailyUsedByEmail(
  email: string,
  date = new Date()
): Promise<number> {
  const normalizedEmail = normalizeEmail(email);
  const day = formatLA_YYYY_MM_DD(date);

  const { data, error } = await supabaseAdmin
    .from("free_daily_usage")
    .select("rewrite_count")
    .eq("normalized_email", normalizedEmail)
    .eq("day", day)
    .maybeSingle();

  if (error) {
    throw new Error("Daily email usage check failed");
  }

  return data?.rewrite_count ?? 0;
}

async function incrementFreeDailyUsageByEmail(
  email: string,
  date = new Date()
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const day = formatLA_YYYY_MM_DD(date);

  const { error } = await supabaseAdmin.rpc("increment_free_daily_usage", {
    p_normalized_email: normalizedEmail,
    p_day: day,
  });

  if (error) {
    throw new Error("Failed to record daily email usage");
  }
}

export async function POST(req: Request) {
  let authUserId: string | null = null;

  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }
    authUserId = authUser.id;

    const ip = getClientIp(req) || "unknown";
    const okUserRate = await isRateLimitAllowed(
      `user:${authUser.id}:rewrite`,
      60,
      30
    );
    const okIpRate = await isRateLimitAllowed(`ip:${ip}:rewrite`, 60, 60);

    if (!okUserRate || !okIpRate) {
      return tooManyRequests("Too many requests");
    }

    let body: RewriteRequestBody = {};

    try {
      body = (await req.json()) as RewriteRequestBody;
    } catch {
      return badRequest("Invalid request body");
    }

    const messageRaw = body.message;
    const recipient = parseRecipient(body.recipient);
    const tone = parseTone(body.tone);

    if (typeof messageRaw !== "string") {
      return badRequest("Message is required");
    }

    const trimmedMessage = messageRaw.trim();

    if (!trimmedMessage) {
      return badRequest("Message is required");
    }

    if (trimmedMessage.length > MAX_MESSAGE_CHARS) {
      return jsonNoStore(
        { ok: false, error: `Message is too long (max ${MAX_MESSAGE_CHARS} characters)` },
        { status: 413 }
      );
    }

    const normalizedEmail = normalizeEmail(authUser.email ?? "");

    if (!normalizedEmail) {
      return badRequest("Missing user email");
    }

    if (!authUser.isPro) {
      const usedToday = await getUsedToday(authUser.id);
      const emailUsedToday = await getFreeDailyUsedByEmail(normalizedEmail);

      if (
        usedToday >= DAILY_FREE_LIMIT ||
        emailUsedToday >= DAILY_FREE_LIMIT
      ) {
        await audit("REWRITE_LIMIT_BLOCKED", authUser.id, req, {
          usedToday,
          emailUsedToday,
          limit: DAILY_FREE_LIMIT,
          normalized_email: normalizedEmail,
        });

        return tooManyRequests(
          "You’ve used all 3 free rewrites for today. Upgrade to Pro for unlimited rewrites."
        );
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
      await recordRewriteFailure(authUser.id, req, "empty_ai_response", {
        model: "gpt-4o-mini",
      });

      return jsonNoStore(
        { ok: false, error: "AI response was empty. Please try again." },
        { status: 502 }
      );
    }

    const soft = extractBlock(raw, "SOFT");
    const calm = extractBlock(raw, "CALM");
    const clear = extractBlock(raw, "CLEAR");

    if (!soft || !calm || !clear) {
      await recordRewriteFailure(authUser.id, req, "invalid_ai_format", {
        model: "gpt-4o-mini",
        hasSoft: Boolean(soft),
        hasCalm: Boolean(calm),
        hasClear: Boolean(clear),
      });

      return jsonNoStore(
        { ok: false, error: "AI response format was invalid. Please try again." },
        { status: 502 }
      );
    }

    const toneScoreRaw = extractBlock(raw, "TONE_SCORE");
    const emotionImpact = extractBlock(raw, "EMOTION_IMPACT");

    let toneScore = Number.parseInt(String(toneScoreRaw).trim(), 10);
    if (!Number.isFinite(toneScore)) toneScore = 0;
    toneScore = Math.max(0, Math.min(100, toneScore));

    await recordUsage(authUser.id);

    if (!authUser.isPro) {
      await incrementFreeDailyUsageByEmail(normalizedEmail);
    }

    await audit("REWRITE_OK", authUser.id, req, {
      is_pro: authUser.isPro,
      normalized_email: normalizedEmail,
    });

    const usedTodayAfter = authUser.isPro ? null : await getUsedToday(authUser.id);

    const rewritesLeft =
  authUser.isPro || usedTodayAfter === null
    ? null
    : Math.max(DAILY_FREE_LIMIT - usedTodayAfter, 0);

return jsonNoStore({
  ok: true,
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
  rewrites_left: rewritesLeft, // ✅ NEW
});
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server error while rewriting message";

    await recordRewriteFailure(authUserId, req, "rewrite_exception", {
      message,
    });

    if (
      message === "Usage check failed" ||
      message === "Daily email usage check failed" ||
      message === "Failed to record rewrite usage" ||
      message === "Failed to record daily email usage"
    ) {
      return serverError(message);
    }

    console.error("REWRITE_ERROR", { message });

    return serverError("Server error while rewriting message");
  }
}