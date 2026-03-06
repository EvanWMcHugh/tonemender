import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

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
  try {
    const url = new URL(req.url);
    const dayParam = url.searchParams.get("day");
    const day = dayParam && isValidDay(dayParam) ? dayParam : formatLA_YYYY_MM_DD(new Date());

    const user = await getAuthUserFromRequest(req);
    if (!user?.id) {
      return jsonNoStore({ stats: { today: 0, total: 0 }, day });
    }

    const { count: total, error: totalError } = await supabaseAdmin
      .from("rewrite_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (totalError) {
      return jsonNoStore({ stats: { today: 0, total: 0 }, day });
    }

    const [startIso, endIso] = laDayBoundsUtcIso(day);

    const { count: today, error: todayError } = await supabaseAdmin
      .from("rewrite_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (todayError) {
      return jsonNoStore({ stats: { today: 0, total: total ?? 0 }, day });
    }

    return jsonNoStore({
      stats: {
        today: today ?? 0,
        total: total ?? 0,
      },
      day,
    });
  } catch {
    return jsonNoStore({ stats: { today: 0, total: 0 } });
  }
}