import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BYPASS_EMAILS = new Set([
  "pro@tonemender.com",
  "free@tonemender.com",
]);

function isBypassEmail(email: string) {
  return BYPASS_EMAILS.has(email.trim().toLowerCase());
}

export async function POST(req: Request) {
  try {
    const { email, token } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
    }

    // ✅ Bypass for internal accounts
    if (isBypassEmail(email)) {
      return NextResponse.json({ ok: true, bypass: true });
    }

    // Everyone else must pass Turnstile
    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, error: "Captcha required" }, { status: 400 });
    }

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured (missing TURNSTILE_SECRET_KEY)" },
        { status: 500 }
      );
    }

    // Cloudflare expects form-encoded body
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);

    // Optional: pass IP (only if you’re sure you want this)
    // const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
    // if (ip) formData.append("remoteip", ip.split(",")[0].trim());

    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    const data = await resp.json();

    if (!data?.success) {
      return NextResponse.json(
        { ok: false, error: "Captcha failed", details: data },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}