import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * MAX POLISH NOTES
 * - Treat this route as *UX gating* (client-side pre-check).
 * - Still enforce Turnstile inside the *real* sensitive routes (sign-in, sign-up, reset, email change).
 * - Adds DB-backed rate limiting + optional audit logging (safe even if RLS is off and service role is used).
 * - Removes easy bypass abuse: bypass allowed only if caller provides an explicit bypass token
 *   OR you can keep your current behavior if you prefer (see BYPASS_MODE below).
 */

const BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

/**
 * Choose bypass mode:
 * - "STRICT": bypass only if email is allowlisted AND client sends a bypassKey that matches env BYPASS_KEY
 * - "LOOSE": bypass if email is allowlisted (your current behavior)
 */
const BYPASS_MODE: "STRICT" | "LOOSE" = "STRICT";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() || null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

function isBypassEmail(email: string) {
  return BYPASS_EMAILS.has(normalizeEmail(email));
}

/**
 * DB rate limit helper (uses your rate_limits table).
 * Returns true if allowed.
 */
async function rateLimitHit(key: string, windowSeconds: number, limit: number) {
  const now = Date.now();
  const windowStartSeconds = Math.floor(now / 1000 / windowSeconds) * windowSeconds;
  const windowStartIso = new Date(windowStartSeconds * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("rate_limits")
    .upsert(
      {
        key,
        window_start: windowStartIso,
        window_seconds: windowSeconds,
        count: 1,
      },
      { onConflict: "key,window_start,window_seconds" }
    )
    .select("count")
    .single();

  if (error) {
    // If rate limiting fails, fail-open (don’t block legit users due to DB hiccups).
    return true;
  }

  // If upsert inserted new row, count will be 1. If it conflicted, we need to increment.
  // Supabase upsert doesn't auto-increment; do an update increment when row exists.
  if (data?.count === 1) return true;

  const { data: inc, error: incErr } = await supabaseAdmin
    .from("rate_limits")
    .update({ count: (data?.count ?? 0) + 1 })
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .eq("window_seconds", windowSeconds)
    .select("count")
    .single();

  if (incErr) return true;
  return (inc?.count ?? 0) <= limit;
}

async function audit(event: string, meta: Record<string, any>, req: Request) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: null,
      event,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      meta,
    });
  } catch {}
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;
    const token = body?.token;
    const bypassKey = body?.bypassKey; // only used in STRICT mode

    if (!emailRaw || typeof emailRaw !== "string") {
      return jsonNoStore({ ok: false, error: "Missing email" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    const ip = getClientIp(req) || "unknown";

    // Rate limit this endpoint (prevents Turnstile verify spam)
    // Tune these limits as desired.
    const allowed = await rateLimitHit(`ip:${ip}:preauth`, 60, 30);
    if (!allowed) {
      await audit("PREAUTH_RATE_LIMITED", { email }, req);
      return jsonNoStore({ ok: false, error: "Too many attempts. Try again soon." }, { status: 429 });
    }

    // Optional bypass for internal accounts
    if (isBypassEmail(email)) {
      if (BYPASS_MODE === "STRICT") {
        const serverBypassKey = process.env.PREAUTH_BYPASS_KEY;
        if (!serverBypassKey) {
          return jsonNoStore(
            { ok: false, error: "Server misconfigured (missing PREAUTH_BYPASS_KEY)" },
            { status: 500 }
          );
        }
        if (!bypassKey || typeof bypassKey !== "string" || bypassKey !== serverBypassKey) {
          // In strict mode, do NOT bypass without the key.
          // Fall through to Turnstile enforcement.
        } else {
          await audit("PREAUTH_BYPASS_OK", { email }, req);
          return jsonNoStore({ ok: true, bypass: true });
        }
      } else {
        // LOOSE mode = your original behavior
        await audit("PREAUTH_BYPASS_OK", { email }, req);
        return jsonNoStore({ ok: true, bypass: true });
      }
    }

    // Everyone else must pass Turnstile
    if (!token || typeof token !== "string") {
      return jsonNoStore({ ok: false, error: "Captcha required" }, { status: 400 });
    }

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return jsonNoStore(
        { ok: false, error: "Server misconfigured (missing TURNSTILE_SECRET_KEY)" },
        { status: 500 }
      );
    }

    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);

    // Optional IP forwarding
    if (ip && ip !== "unknown") formData.append("remoteip", ip);

    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      await audit("PREAUTH_TURNSTILE_UPSTREAM_ERROR", { email, status: resp.status }, req);
      return jsonNoStore(
        { ok: false, error: "Captcha verification request failed" },
        { status: 502 }
      );
    }

    const data: any = await resp.json().catch(() => null);

    if (!data?.success) {
      const codes = Array.isArray(data?.["error-codes"]) ? data["error-codes"] : undefined;
      await audit("PREAUTH_TURNSTILE_FAILED", { email, codes }, req);

      return jsonNoStore(
        { ok: false, error: "Captcha failed", codes },
        { status: 403 }
      );
    }

    await audit("PREAUTH_OK", { email }, req);
    return jsonNoStore({ ok: true });
  } catch (err) {
    return jsonNoStore({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}