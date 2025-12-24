import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { isReviewer } from "../../../../lib/reviewers";

export async function POST(req: Request) {
  try {
    const { email, password, captchaToken } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }
const reviewer = isReviewer(email);

if (!reviewer && !captchaToken) {
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

const { data, error } = await supabaseServer.auth.signUp({
  email,
  password,
  options: reviewer
    ? undefined
    : { captchaToken },
});

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    if (reviewer && data?.user) {
  await supabaseServer.auth.admin.updateUserById(
    data.user.id,
    { email_confirm: true }
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