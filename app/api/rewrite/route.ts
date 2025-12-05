import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// 🔒 Server-side Supabase client (service role key required)
const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!, // service key for server only
  { auth: { persistSession: false } }
);

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(request: Request) {
  try {
    const { token, message, recipient, tone } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Missing auth token" },
        { status: 401 }
      );
    }

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // -------- AUTH CHECK (SERVER SAFE) --------
    const {
      data: auth,
      error: authError,
    } = await supabaseServer.auth.getUser(token);

    if (authError || !auth?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = auth.user;

    // -------- CHECK PRO STATUS + FREE LIMIT INFO --------
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("is_pro, free_rewrites_remaining, last_reset_date")
      .eq("id", user.id)
      .single();

    // -------- MIDNIGHT RESET CHECK (LOCAL DAILY RESET) --------
    if (profile && !profile.is_pro) {
      const today = new Date().toISOString().split("T")[0];

      if (profile.last_reset_date !== today) {
        await supabaseServer
          .from("profiles")
          .update({
            free_rewrites_remaining: 3,
            last_reset_date: today,
          })
          .eq("id", user.id);

        profile.free_rewrites_remaining = 3;
      }

      if (profile.free_rewrites_remaining <= 0) {
        return NextResponse.json(
          { error: "Daily limit reached" },
          { status: 429 }
        );
      }
    }

    // -------- CONTEXT MAPPING --------
    const trimmedMessage = message.trim();

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

    // -------- AI PROMPT (REWRITES + SCORE + EMOTION) --------
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

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const raw = (completion.choices[0].message.content ?? "").trim();

    const extract = (label: string) => {
      const regex = new RegExp(`${label}:([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, "i");
      const match = raw.match(regex);
      return match ? match[1].trim() : "";
    };

    const soft = extract("SOFT");
    const calm = extract("CALM");
    const clear = extract("CLEAR");
    const toneScoreRaw = extract("TONE_SCORE");
    const emotionImpact = extract("EMOTION_IMPACT");

    const tone_score = parseInt(toneScoreRaw, 10) || 0;

    // -------- LOG REWRITE USAGE --------
    await supabaseServer.from("rewrite_usage").insert({
      user_id: user.id,
    });

    // Decrement free rewrite count only for non-pro users
    if (profile && !profile.is_pro) {
      await supabaseServer
        .from("profiles")
        .update({
          free_rewrites_remaining: profile.free_rewrites_remaining - 1,
        })
        .eq("id", user.id);
    }

    return NextResponse.json({
      soft,
      calm,
      clear,
      tone_score,
      emotion_prediction: emotionImpact,
    });
  } catch (err: any) {
    console.error("REWRITE ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}