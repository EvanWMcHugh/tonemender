import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error("Missing SUPABASE_SECRET_KEY");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req: Request) {
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("*")
    .eq("confirm_token", token)
    .single();

  if (!data || error) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  await supabase
    .from("newsletter_subscribers")
    .update({
      confirmed: true,
      confirmed_at: new Date(),
      confirm_token: null,
    })
    .eq("id", data.id);

  return NextResponse.json({ success: true, email: data.email });
}