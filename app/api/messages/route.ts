import {
  badRequest,
  jsonNoStore,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";

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

/* ------------------ GET ------------------ */

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
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
      console.error("MESSAGES_GET_FAILED", {
        message: error.message,
      });
      return serverError("Could not load drafts");
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

    return jsonNoStore({ ok: true, drafts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("MESSAGES_GET_ERROR", { message });

    return serverError("Server error");
  }
}

/* ------------------ POST ------------------ */

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }

    let body: SaveMessageBody = {};

    try {
      body = (await req.json()) as SaveMessageBody;
    } catch {
      return badRequest("Invalid request body");
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
      return badRequest("Missing original message");
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
      console.error("MESSAGES_SAVE_FAILED", {
        message: error.message,
      });

      await audit("MESSAGE_SAVE_FAILED", authUser.id, req, {
        code: error.code,
        message: error.message,
      });

      return serverError("Failed to save draft");
    }

    await audit("MESSAGE_SAVED", authUser.id, req, {
      message_id: data.id,
      tone,
    });

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
      return badRequest(error.message);
    }

    const message = error instanceof Error ? error.message : String(error);

    console.error("MESSAGES_SAVE_ERROR", { message });

    return serverError("Server error");
  }
}