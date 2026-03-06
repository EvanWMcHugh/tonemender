import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}

function getCookieDomain(req: Request) {
  const host = req.headers.get("host") || "";

  if (
    host === "tonemender.com" ||
    host === "www.tonemender.com" ||
    host.endsWith(".tonemender.com")
  ) {
    return ".tonemender.com";
  }

  return undefined;
}

async function audit(
  event: string,
  userId: string | null,
  req: Request,
  meta: Record<string, unknown> = {}
) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      event,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      meta,
    });
  } catch {}
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUserFromRequest(req);

    if (!user?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("id,stripe_customer_id,stripe_subscription_id,plan_type,deleted_at,disabled_at")
      .eq("id", user.id)
      .maybeSingle();

    if (userError || !userRow) {
      return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    }

    if (userRow.deleted_at) {
      const res = jsonNoStore({ ok: true, success: true });

      const cookieDomain = getCookieDomain(req);

      res.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      });

      return res;
    }

    const { error: softDeleteError } = await supabaseAdmin
      .from("users")
      .update({
        deleted_at: nowIso,
        disabled_at: nowIso,
        is_pro: false,
        plan_type: null,
      })
      .eq("id", user.id);

    if (softDeleteError) {
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    try {
      await supabaseAdmin
        .from("sessions")
        .update({ revoked_at: nowIso })
        .eq("user_id", user.id)
        .is("revoked_at", null);
    } catch {}

    try {
      await supabaseAdmin
        .from("auth_tokens")
        .update({ consumed_at: nowIso })
        .eq("user_id", user.id)
        .is("consumed_at", null);
    } catch {}

    try {
      await supabaseAdmin.from("messages").delete().eq("user_id", user.id);
    } catch {}

    try {
      await supabaseAdmin.from("rewrite_usage").delete().eq("user_id", user.id);
    } catch {}

    await audit("ACCOUNT_DELETED", user.id, req, {
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
    });

    const res = jsonNoStore({
      ok: true,
      success: true,
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
      plan_type: userRow.plan_type ?? null,
    });

    const cookieDomain = getCookieDomain(req);

    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return res;
  } catch {
    return jsonNoStore(
      { error: "Server error while deleting account" },
      { status: 500 }
    );
  }
}