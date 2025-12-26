import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { ALL_REVIEWER_EMAILS } from "../../../../lib/reviewers";

export async function POST(req: Request) {
  try {
    const { email, password, captchaToken } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();
    const isReviewer = ALL_REVIEWER_EMAILS.includes(normalizedEmail);

    // Only require captcha for non-reviewers
    if (!isReviewer && !captchaToken) {
      return NextResponse.json(
        { error: "Captcha required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer.auth.signUp({
  email: normalizedEmail,
  password,
  options: {
    captchaToken: isReviewer ? undefined : captchaToken,
    emailRedirectTo: "https://tonemender.com/check-email",
  },
});

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: data.user });
  } catch (err: any) {
    console.error("SIGNUP ERROR:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}