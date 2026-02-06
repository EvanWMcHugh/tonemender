import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isBypassEmail(email: string) {
  return BYPASS_EMAILS.has(normalizeEmail(email));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = body?.email;
    const token = body?.token;

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

    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);

    // Optional IP forwarding
    const forwardedFor = req.headers.get("x-forwarded-for");
    const cfIp = req.headers.get("cf-connecting-ip");
    const ip = (cfIp ?? forwardedFor)?.split(",")[0]?.trim();
    if (ip) formData.append("remoteip", ip);

    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: "Captcha verification request failed" },
        { status: 502 }
      );
    }

    const data: any = await resp.json().catch(() => null);

    if (!data?.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Captcha failed",
          codes: Array.isArray(data?.["error-codes"]) ? data["error-codes"] : undefined,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}