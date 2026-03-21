import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const TIMEZONE = "America/Los_Angeles";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function isValidDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

function formatLA_YYYY_MM_DD(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTzOffsetMinutes(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const tzName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);

  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;

  return sign * (hours * 60 + minutes);
}

function laDayBoundsUtcIso(dayYYYYMMDD: string) {
  const [year, month, day] = dayYYYYMMDD.split("-").map((value) => parseInt(value, 10));

  const startLocalAsUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const startOffsetMinutes = getTzOffsetMinutes(TIMEZONE, startLocalAsUtc);
  const startUtc = new Date(startLocalAsUtc.getTime() - startOffsetMinutes * 60_000);

  const endLocalAsUtc = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const endOffsetMinutes = getTzOffsetMinutes(TIMEZONE, endLocalAsUtc);
  const endUtc = new Date(endLocalAsUtc.getTime() - endOffsetMinutes * 60_000);

  return [startUtc.toISOString(), endUtc.toISOString()] as const;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  const day = dayParam && isValidDay(dayParam) ? dayParam : formatLA_YYYY_MM_DD(new Date());

  try {
    const user = await getAuthUserFromRequest(req);

    if (!user?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const [startIso, endIso] = laDayBoundsUtcIso(day);

    const totalResult = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (totalResult.error) {
      console.error("USAGE STATS total query failed:", totalResult.error);
      return jsonNoStore({ error: "Failed to load usage stats" }, { status: 500 });
    }

    const todayResult = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (todayResult.error) {
      console.error("USAGE STATS today query failed:", todayResult.error);
      return jsonNoStore({ error: "Failed to load usage stats" }, { status: 500 });
    }

    return jsonNoStore({
      stats: {
        today: todayResult.count ?? 0,
        total: totalResult.count ?? 0,
      },
      day,
    });
  } catch (err) {
    console.error("USAGE STATS ERROR:", err);
    return jsonNoStore({ error: "Failed to load usage stats" }, { status: 500 });
  }
}