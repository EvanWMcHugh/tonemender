import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";

export async function POST(req: Request) {
  try {
    const { email, password, captchaToken } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }
    if (!captchaToken) {
  return NextResponse.json(
    { error: "Captcha verification required" },
    { status: 400 }
  );
}

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const blockedDomains = [
      "mailinator.com",
      "tempmail.com",
      "10minutemail.com",
      "guerrillamail.com",
    ];

    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && blockedDomains.includes(domain)) {
      return NextResponse.json(
        { error: "Disposable email addresses are not allowed" },
        { status: 400 }
      );
    }

   const { error } = await supabaseServer.auth.signUp({
  email,
  password,
  options: {
    captchaToken,
  },
});

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}