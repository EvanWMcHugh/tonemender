import {
  badRequest,
  jsonNoStore,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";

export const runtime = "nodejs";

type DeleteDraftBody = {
  draftId?: unknown;
};

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
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }

    let body: DeleteDraftBody = {};

    try {
      body = (await req.json()) as DeleteDraftBody;
    } catch {
      return badRequest("Invalid request body");
    }

    const draftId =
      typeof body.draftId === "string" ? body.draftId.trim() : "";

    if (!draftId) {
      return badRequest("Missing draftId");
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("id", draftId)
      .eq("user_id", authUser.id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("MESSAGES_DELETE_FAILED", {
        message: error.message,
        draftId,
        userId: authUser.id,
      });

      await audit("MESSAGE_DELETE_FAILED", authUser.id, req, {
        draft_id: draftId,
        code: error.code,
        message: error.message,
      });

      return serverError("Failed to delete draft");
    }

    if (!data) {
      await audit("MESSAGE_DELETE_NOT_FOUND", authUser.id, req, {
        draft_id: draftId,
      });

      return jsonNoStore(
        { ok: false, error: "Draft not found" },
        { status: 404 }
      );
    }

    await audit("MESSAGE_DELETED", authUser.id, req, {
      draft_id: data.id,
    });

    return jsonNoStore({
      ok: true,
      deletedId: String(data.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("MESSAGES_DELETE_ERROR", { message });

    return serverError("Server error");
  }
}