import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 5000;
const VALID_TONES = new Set(["soft", "calm", "clear"]);

type MessageRow = {
  id: string | number;
  created_at: string | null;
  original: string | null;
  tone: string | null;
  soft_rewrite: string | null;
  calm_rewrite: string | null;
  clear_rewrite: string | null;
};

type SaveMessageBody = {
  original?: unknown;
  message?: unknown;
  tone?: unknown;
  soft_rewrite?: unknown;
  softRewrite?: unknown;
  calm_rewrite?: unknown;
  calmRewrite?: unknown;
  clear_rewrite?: unknown;
  clearRewrite?: unknown;
};

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseTone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return VALID_TONES.has(trimmed) ? trimmed : null;
}

function enforceMaxLength(value: string | null, fieldName: string) {
  if (value && value.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`${fieldName} is too long`);
  }
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select(
        `
        id,
        created_at,
        original,
        tone,
        soft_rewrite,
        calm_rewrite,
        clear_rewrite
      `
      )
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET MESSAGES ERROR:", error);
      return jsonNoStore({ error: "Could not load drafts" }, { status: 500 });
    }

    const drafts = ((data ?? []) as MessageRow[]).map((row) => ({
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

    let body: SaveMessageBody = {};
    try {
      body = (await req.json()) as SaveMessageBody;
    } catch {
      return jsonNoStore({ error: "Invalid request body" }, { status: 400 });
    }

    const original =
      typeof body.original === "string"
        ? body.original.trim()
        : typeof body.message === "string"
        ? body.message.trim()
        : "";

    const tone = parseTone(body.tone);

    const softRewrite =
      normalizeOptionalString(body.soft_rewrite) ??
      normalizeOptionalString(body.softRewrite);

    const calmRewrite =
      normalizeOptionalString(body.calm_rewrite) ??
      normalizeOptionalString(body.calmRewrite);

    const clearRewrite =
      normalizeOptionalString(body.clear_rewrite) ??
      normalizeOptionalString(body.clearRewrite);

    if (!original) {
      return jsonNoStore({ error: "Missing original message" }, { status: 400 });
    }

    enforceMaxLength(original, "Original message");
    enforceMaxLength(softRewrite, "Soft rewrite");
    enforceMaxLength(calmRewrite, "Calm rewrite");
    enforceMaxLength(clearRewrite, "Clear rewrite");

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
      return jsonNoStore({ error: "Failed to save draft" }, { status: 500 });
    }

    return jsonNoStore({
      ok: true,
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
    if (error instanceof Error && error.message.endsWith("is too long")) {
      return jsonNoStore({ error: error.message }, { status: 400 });
    }

    console.error("SAVE MESSAGE ROUTE ERROR:", error);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}