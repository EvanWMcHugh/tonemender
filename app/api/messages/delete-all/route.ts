import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";

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

    const { error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", authUser.id);

    if (error) {
      console.error("DELETE ALL DRAFTS ERROR:", error);
      return jsonNoStore({ error: "Failed to delete drafts" }, { status: 500 });
    }

    return jsonNoStore({ success: true });
  } catch (error) {
    console.error("DELETE ALL DRAFTS ROUTE ERROR:", error);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}