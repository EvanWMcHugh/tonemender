import { jsonNoStore, serverError, unauthorized } from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }

    const { error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", authUser.id);

    if (error) {
      console.error("MESSAGES_DELETE_ALL_FAILED", {
        message: error.message,
        userId: authUser.id,
      });
      return serverError("Failed to delete drafts");
    }

    return jsonNoStore({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("MESSAGES_DELETE_ALL_ERROR", { message });

    return serverError("Server error");
  }
}