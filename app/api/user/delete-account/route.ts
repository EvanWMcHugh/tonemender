import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";

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

function clearSessionCookie(res: NextResponse, req: Request) {
  const cookieDomain = getCookieDomain(req);

  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("id,email,stripe_customer_id,stripe_subscription_id,plan_type")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userError || !userRow) {
      return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    }

    // Write audit event first while user_id still exists.
    await audit("ACCOUNT_DELETE_STARTED", authUser.id, req, {
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
      plan_type: userRow.plan_type ?? null,
    });

    // Delete child / dependent rows first.
    const { error: sessionsError } = await supabaseAdmin
      .from("sessions")
      .delete()
      .eq("user_id", authUser.id);

    if (sessionsError) {
      console.error("DELETE ACCOUNT: sessions delete failed:", sessionsError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: authTokensError } = await supabaseAdmin
      .from("auth_tokens")
      .delete()
      .eq("user_id", authUser.id);

    if (authTokensError) {
      console.error("DELETE ACCOUNT: auth_tokens delete failed:", authTokensError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: messagesError } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", authUser.id);

    if (messagesError) {
      console.error("DELETE ACCOUNT: messages delete failed:", messagesError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    const { error: rewriteUsageError } = await supabaseAdmin
      .from("rewrite_usage")
      .delete()
      .eq("user_id", authUser.id);

    if (rewriteUsageError) {
      console.error("DELETE ACCOUNT: rewrite_usage delete failed:", rewriteUsageError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    // Delete profile if table/row exists.
    const { error: profilesError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("user_id", authUser.id);

    if (profilesError) {
      console.error("DELETE ACCOUNT: profiles delete failed:", profilesError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    // Keep audit logs, but detach them from the user row if needed.
    // This avoids FK issues when deleting users.
    const { error: auditNullError } = await supabaseAdmin
      .from("audit_log")
      .update({ user_id: null })
      .eq("user_id", authUser.id);

    if (auditNullError) {
      console.error("DELETE ACCOUNT: audit_log null-out failed:", auditNullError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    // Delete the core user row last.
    const { error: userDeleteError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", authUser.id);

    if (userDeleteError) {
      console.error("DELETE ACCOUNT: users delete failed:", userDeleteError);
      return jsonNoStore({ error: "Failed to delete account" }, { status: 500 });
    }

    // Final audit without user_id attached, since the user row is now gone.
    await audit("ACCOUNT_DELETED", null, req, {
      deleted_user_id: authUser.id,
      deleted_email: userRow.email ?? null,
      stripe_customer_id: userRow.stripe_customer_id ?? null,
      stripe_subscription_id: userRow.stripe_subscription_id ?? null,
      plan_type: userRow.plan_type ?? null,
    });

    const res = jsonNoStore({
      ok: true,
      success: true,
    });

    clearSessionCookie(res, req);
    return res;
  } catch (error) {
    console.error("DELETE ACCOUNT ROUTE ERROR:", error);
    return jsonNoStore(
      { error: "Server error while deleting account" },
      { status: 500 }
    );
  }
}