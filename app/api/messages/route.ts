import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";

type CreateDraftBody = {
  original?: unknown;
  tone?: unknown;
  soft_rewrite?: unknown;
  calm_rewrite?: unknown;
  clear_rewrite?: unknown;
};

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(req: Request) {
  try {
    const user = await getAuthUserFromRequest(req);

    if (!user?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("id, created_at, original, tone, soft_rewrite, calm_rewrite, clear_rewrite")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return jsonNoStore({ error: "Could not load drafts." }, { status: 500 });
    }

    return jsonNoStore({
      drafts: data ?? [],
    });
  } catch {
    return jsonNoStore({ error: "Could not load drafts." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUserFromRequest(req);

    if (!user?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as CreateDraftBody;

    const original = normalizeNullableString(body.original);
    const tone = normalizeNullableString(body.tone);
    const softRewrite = normalizeNullableString(body.soft_rewrite);
    const calmRewrite = normalizeNullableString(body.calm_rewrite);
    const clearRewrite = normalizeNullableString(body.clear_rewrite);

    if (!original) {
      return jsonNoStore({ error: "Original message is required." }, { status: 400 });
    }

    if (!softRewrite && !calmRewrite && !clearRewrite) {
      return jsonNoStore({ error: "At least one rewrite is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        user_id: user.id,
        original,
        tone,
        soft_rewrite: softRewrite,
        calm_rewrite: calmRewrite,
        clear_rewrite: clearRewrite,
      })
      .select("id, created_at, original, tone, soft_rewrite, calm_rewrite, clear_rewrite")
      .single();

    if (error) {
      return jsonNoStore({ error: "Failed to save draft." }, { status: 500 });
    }

    return jsonNoStore({
      ok: true,
      draft: data,
    });
  } catch {
    return jsonNoStore({ error: "Failed to save draft." }, { status: 500 });
  }
}