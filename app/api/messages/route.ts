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
        original,
        tone,
        soft_rewrite,
        calm_rewrite,
        clear_rewrite
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
      original: row.original ?? null,
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

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));

    const original =
      typeof body?.original === "string"
        ? body.original.trim()
        : typeof body?.message === "string"
        ? body.message.trim()
        : "";

    const tone =
      typeof body?.tone === "string" ? body.tone.trim() : null;

    const softRewrite =
      typeof body?.soft_rewrite === "string"
        ? body.soft_rewrite
        : typeof body?.softRewrite === "string"
        ? body.softRewrite
        : null;

    const calmRewrite =
      typeof body?.calm_rewrite === "string"
        ? body.calm_rewrite
        : typeof body?.calmRewrite === "string"
        ? body.calmRewrite
        : null;

    const clearRewrite =
      typeof body?.clear_rewrite === "string"
        ? body.clear_rewrite
        : typeof body?.clearRewrite === "string"
        ? body.clearRewrite
        : null;

    if (!original) {
      return jsonNoStore({ error: "Missing original message" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        user_id: authUser.id,
        original,
        tone,
        soft_rewrite: softRewrite,
        calm_rewrite: calmRewrite,
        clear_rewrite: clearRewrite,
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("SAVE MESSAGE ERROR:", error);
      return jsonNoStore(
        {
          error: "Failed to save draft",
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 500 }
      );
    }

    return jsonNoStore({
      success: true,
      draft: {
        id: String(data.id),
        created_at: data.created_at ?? "",
        original,
        tone,
        soft_rewrite: softRewrite,
        calm_rewrite: calmRewrite,
        clear_rewrite: clearRewrite,
      },
    });
  } catch (error) {
    console.error("SAVE MESSAGE ROUTE ERROR:", error);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}