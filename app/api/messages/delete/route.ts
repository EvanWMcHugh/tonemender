import {
  badRequest,
  jsonNoStore,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const runtime = "nodejs";

type DeleteDraftBody = {
  draftId?: unknown;
};

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
      return serverError("Failed to delete draft");
    }

    if (!data) {
      return jsonNoStore(
        { ok: false, error: "Draft not found" },
        { status: 404 }
      );
    }

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