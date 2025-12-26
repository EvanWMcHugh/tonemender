import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server"; // your server supabase client
import { ALL_REVIEWER_EMAILS } from "../../../../lib/reviewers";

export async function POST(req: NextRequest) {
  try {
    const { email, password, captchaToken } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();
    const isReviewer = ALL_REVIEWER_EMAILS.includes(normalizedEmail);

    // Require captcha only for non-reviewers
    if (!isReviewer && !captchaToken) {
      return NextResponse.json({ error: "Captcha required" }, { status: 400 });
    }

    const { data, error } = await supabaseServer.auth.signInWithPassword({
      email: normalizedEmail,
      password,
      options: {
        captchaToken: isReviewer ? undefined : captchaToken,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ user: data.user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}