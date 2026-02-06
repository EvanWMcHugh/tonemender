import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// 🔒 Server-side Supabase client (service role key required)
const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const TIMEZONE = "America/Los_Angeles";
const DAILY_FREE_LIMIT = 3;
const MAX_MESSAGE_CHARS = 2000;

function todayInLA(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function extractBlock(raw: string, label: string): string {
  const regex = new RegExp(
    `(^|\\n)${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z_]+\\s*:|$)`,
    "i"
  );
  const match = raw.match(regex);
  return match ? match[2].trim() : "";
}

export async function POST(request: Request) {
  try {
    // -------- Parse body safely (no Promise.catch chaining) --------
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }

    const { token: tokenFromBody, message, recipient, tone } = body ?? {};

    // Prefer Authorization header: "Bearer <token>"
    const authHeader = request.headers.get("authorization") || "";
    const tokenFromHeader = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

    const token = tokenFromHeader || tokenFromBody;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing auth token" }, { status: 401 });
    }

    if (!message || typeof message !== "string") {
      return jsonNoStore({ error: "Message is required" }, { status: 400 });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return jsonNoStore({ error: "Message is required" }, { status: 400 });
    }

    if (trimmedMessage.length > MAX_MESSAGE_CHARS) {
      return jsonNoStore(
        { error: `Message is too long (max ${MAX_MESSAGE_CHARS} characters)` },
        { status: 413 }
      );
    }

    // -------- AUTH CHECK (SERVER SAFE) --------
    const { data: auth, error: authError } = await supabaseServer.auth.getUser(
      token
    );

    if (authError || !auth?.user) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const user = auth.user;

    // -------- CHECK PRO STATUS + FREE LIMIT INFO --------
    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("is_pro, free_rewrites_remaining, last_reset_date")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return jsonNoStore({ error: "Profile not found" }, { status: 404 });
    }

    // -------- DAILY RESET + LIMIT CHECK --------
    if (!profile.is_pro) {
      const today = todayInLA();

      if (profile.last_reset_date !== today) {
        const { error: resetError } = await supabaseServer
          .from("profiles")
          .update({
            free_rewrites_remaining: DAILY_FREE_LIMIT,
            last_reset_date: today,
          })
          .eq("id", user.id);

        if (!resetError) {
          profile.free_rewrites_remaining = DAILY_FREE_LIMIT;
          profile.last_reset_date = today;
        }
      }

      if ((profile.free_rewrites_remaining ?? 0) <= 0) {
        return jsonNoStore({ error: "Daily limit reached" }, { status: 429 });
      }
    }

    // -------- CONTEXT MAPPING --------
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

    // -------- AI PROMPT --------
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

    let tone_score = Number.parseInt(String(toneScoreRaw).trim(), 10);
    if (!Number.isFinite(tone_score)) tone_score = 0;
    tone_score = Math.max(0, Math.min(100, tone_score));

    // -------- LOG REWRITE USAGE (best-effort) --------
    try {
      await supabaseServer.from("rewrite_usage").insert({ user_id: user.id });
    } catch (e) {
      // ignore
    }

    // Decrement free rewrite count only for non-pro users (best-effort)
    if (!profile.is_pro) {
      const nextRemaining = Math.max(
        0,
        Number(profile.free_rewrites_remaining ?? 0) - 1
      );

      try {
        await supabaseServer
          .from("profiles")
          .update({ free_rewrites_remaining: nextRemaining })
          .eq("id", user.id);
      } catch (e) {
        // ignore
      }
    }

    return jsonNoStore({
      soft,
      calm,
      clear,
      tone_score,
      emotion_prediction: emotionImpact,
    });
  } catch (err) {
    console.error("REWRITE ERROR:", err);
    return jsonNoStore(
      { error: "Server error while rewriting message" },
      { status: 500 }
    );
  }
}