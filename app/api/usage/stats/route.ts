import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getUserIdFromSession(req: Request) {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;

  const hash = sha256Hex(raw);

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (error || !session) return null;

  const exp = new Date(session.expires_at).getTime();
  if (Number.isNaN(exp) || exp < Date.now()) {
    try {
      await supabaseAdmin.from("sessions").delete().eq("session_token_hash", hash);
    } catch {}
    return null;
  }

  return session.user_id as string;
}

function isValidDay(day: string) {
  // Expect YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const day = url.searchParams.get("day") || ""; // YYYY-MM-DD (Pacific) computed by client

    // Always return a stats payload (never 401) to keep UI simple
    const userId = await getUserIdFromSession(req);
    if (!userId) return jsonNoStore({ stats: { today: 0, total: 0 } }, { status: 200 });

    // Validate day param
    if (!day || !isValidDay(day)) {
      return jsonNoStore({ stats: { today: 0, total: 0 } }, { status: 200 });
    }

    // ✅ Efficient counts (no full table scan / no downloading all rows)
    const { count: total, error: totalErr } = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (totalErr) return jsonNoStore({ stats: { today: 0, total: 0 } }, { status: 200 });

    // NOTE: created_at is UTC. Comparing created_at::date to a Pacific day string is NOT timezone-correct.
    // Best solution: store a "day" column (YYYY-MM-DD Pacific) at write time and count on that.
    // We'll support both:
    // 1) If rewrite_usage has "day" column -> use it.
    // 2) Otherwise fallback to a UTC date match (approx).

    // Try fast path: day column
    const { count: todayByDayCol, error: dayColErr } = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("day", day);

    if (!dayColErr) {
      return jsonNoStore({
        stats: { today: todayByDayCol ?? 0, total: total ?? 0 },
      });
    }

    // Fallback path: UTC date match (may be off around midnight Pacific)
    const { count: todayUtc, error: todayErr } = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      // created_at::date = 'YYYY-MM-DD' in UTC
      .gte("created_at", `${day}T00:00:00.000Z`)
      .lt("created_at", `${day}T23:59:59.999Z`);

    if (todayErr) return jsonNoStore({ stats: { today: 0, total: total ?? 0 } }, { status: 200 });

    return jsonNoStore({
      stats: { today: todayUtc ?? 0, total: total ?? 0 },
    });
  } catch (err) {
    console.error("USAGE STATS ERROR:", err);
    return jsonNoStore({ stats: { today: 0, total: 0 } }, { status: 200 });
  }
}