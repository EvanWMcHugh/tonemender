import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";

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
      return jsonNoStore({ error: "Not authenticated" }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      await audit("DRAFTS_DELETE_ALL_FAILED", user.id, req);
      return jsonNoStore({ error: "Failed to delete drafts" }, { status: 500 });
    }

    await audit("DRAFTS_DELETE_ALL_OK", user.id, req);
    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}