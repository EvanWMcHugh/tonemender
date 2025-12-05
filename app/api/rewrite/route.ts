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
    const { token, message, recipient } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Missing auth token" },
        { status: 401 }
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

    // -------- CHECK PRO STATUS --------
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("is_pro, free_rewrites_remaining, last_reset_date") // ⭐ NEW
      .eq("id", user.id)
      .single();

    // -------- MIDNIGHT RESET CHECK (LOCAL DAILY RESET) --------
    if (!profile?.is_pro) {
      const today = new Date().toISOString().split("T")[0];

      // If last reset was NOT today → reset counter
      if (profile.last_reset_date !== today) {
        await supabaseServer
          .from("profiles")
          .update({
            free_rewrites_remaining: 3,   // ⭐ NEW
            last_reset_date: today,       // ⭐ NEW
          })
          .eq("id", user.id);
        profile.free_rewrites_remaining = 3;  // ⭐ update local value
      }

      // -------- DAILY LIMIT ENFORCEMENT --------
      if (profile.free_rewrites_remaining <= 0) {
        return NextResponse.json(
          { error: "Daily limit reached" },
          { status: 429 }
        );
      }
    }

    // -------- PERFORM AI REWRITE --------
    const prompt = `
Rewrite the following message into 3 versions for a ${recipient}:

SOFT:
CALM:
CLEAR:

Message: "${message}"

Return EXACTLY:

SOFT: <soft>
CALM: <calm>
CLEAR: <clear>
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0].message.content ?? "";

    const extract = (label: string) => {
      const regex = new RegExp(`${label}:([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, "i");
      const match = raw.match(regex);
      return match ? match[1].trim() : "";
    };

    const soft = extract("SOFT");
    const calm = extract("CALM");
    const clear = extract("CLEAR");

    // -------- LOG REWRITE USAGE --------
    await supabaseServer.from("rewrite_usage").insert({
      user_id: user.id,
    });

    // ⭐ NEW: decrement free rewrite count only for non-pro users
    if (!profile?.is_pro) {
      await supabaseServer
        .from("profiles")
        .update({
          free_rewrites_remaining: profile.free_rewrites_remaining - 1,
        })
        .eq("id", user.id);
    }

    return NextResponse.json({ soft, calm, clear });
  } catch (err: any) {
    console.error("REWRITE ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}