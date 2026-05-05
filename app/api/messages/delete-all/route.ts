import { jsonNoStore, serverError, unauthorized } from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";

export const runtime = "nodejs";

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

    const { error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", authUser.id);

    if (error) {
      console.error("MESSAGES_DELETE_ALL_FAILED", {
        message: error.message,
        userId: authUser.id,
      });

      await audit("MESSAGES_DELETE_ALL_FAILED", authUser.id, req, {
        code: error.code,
        message: error.message,
      });

      return serverError("Failed to delete drafts");
    }

    await audit("MESSAGES_DELETE_ALL", authUser.id, req);

    return jsonNoStore({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("MESSAGES_DELETE_ALL_ERROR", { message });

    return serverError("Server error");
  }
}