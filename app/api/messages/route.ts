import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select(`
        id,
        created_at,
        tone,
        soft_rewrite,
        calm_rewrite,
        clear_rewrite,
        message,
        original_message,
        original_message_snapshot
      `)
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET MESSAGES ERROR:", error);
      return jsonNoStore({ error: "Could not load drafts" }, { status: 500 });
    }

    const drafts = (data ?? []).map((row: any) => ({
      id: String(row.id),
      created_at: row.created_at ?? "",
      original:
        row.original_message_snapshot ??
        row.original_message ??
        row.message ??
        null,
      tone: row.tone ?? null,
      soft_rewrite: row.soft_rewrite ?? null,
      calm_rewrite: row.calm_rewrite ?? null,
      clear_rewrite: row.clear_rewrite ?? null,
    }));

    return jsonNoStore({ drafts });
  } catch (error) {
    console.error("GET MESSAGES ROUTE ERROR:", error);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}