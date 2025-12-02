import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../lib/supabase";

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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", detail: authError?.message },
        { status: 401 }
      );
    }

    const prompt = `
Rewrite the following message into 3 versions for a ${recipient}:

SOFT:
CALM:
CLEAR:

Message: "${message}"

Return your answer ONLY in this format:

SOFT: <soft rewrite>

CALM: <calm rewrite>

CLEAR: <clear rewrite>
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const raw: string = completion.choices[0].message.content ?? "";

    // FIXED extract function
    const extractBlock = (label: string): string => {
      const regex = new RegExp(`${label}:([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, "i");
      const match = raw.match(regex);
      return match ? match[1].trim() : "";
    };

    const soft = extractBlock("SOFT");
    const calm = extractBlock("CALM");
    const clear = extractBlock("CLEAR");

    return NextResponse.json({ soft, calm, clear });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}