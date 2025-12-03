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

    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const prompt = `
Rewrite the following message into 3 versions for a ${recipient}:

SOFT:
CALM:
CLEAR:

Message: "${message}"

Return ONLY:

SOFT: <soft>
CALM: <calm>
CLEAR: <clear>
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const raw: string = completion.choices[0].message.content ?? "";

    const extractBlock = (label: string): string => {
      const regex = new RegExp(`${label}:([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, "i");
      const match = raw.match(regex);
      return match ? match[1].trim() : "";
    };

    return NextResponse.json({
      soft: extractBlock("SOFT"),
      calm: extractBlock("CALM"),
      clear: extractBlock("CLEAR"),
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}