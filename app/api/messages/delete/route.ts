import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";

export const runtime = "nodejs";

type DeleteDraftBody = {
  draftId?: unknown;
};

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    let body: DeleteDraftBody = {};
    try {
      body = (await req.json()) as DeleteDraftBody;
    } catch {
      return jsonNoStore({ error: "Invalid request body" }, { status: 400 });
    }

    const draftId = body.draftId;

    if (typeof draftId !== "string" || !draftId.trim()) {
      return jsonNoStore({ error: "Missing draftId" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("id", draftId.trim())
      .eq("user_id", authUser.id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("DELETE DRAFT ERROR:", error);
      return jsonNoStore({ error: "Failed to delete draft" }, { status: 500 });
    }

    if (!data) {
      return jsonNoStore({ error: "Draft not found" }, { status: 404 });
    }

    return jsonNoStore({ ok: true, deletedId: String(data.id) });
  } catch (error) {
    console.error("DELETE DRAFT ROUTE ERROR:", error);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}