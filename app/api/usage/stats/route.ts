import {
  badRequest,
  jsonNoStore,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const runtime = "nodejs";

const TIMEZONE = "America/Los_Angeles";

function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

function formatLA_YYYY_MM_DD(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTzOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const tzName =
    parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);

  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;

  return sign * (hours * 60 + minutes);
}

function laDayBoundsUtcIso(dayYYYYMMDD: string): readonly [string, string] {
  const [year, month, day] = dayYYYYMMDD
    .split("-")
    .map((value) => Number.parseInt(value, 10));

  const startLocalAsUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const startOffsetMinutes = getTzOffsetMinutes(TIMEZONE, startLocalAsUtc);
  const startUtc = new Date(
    startLocalAsUtc.getTime() - startOffsetMinutes * 60_000
  );

  const endLocalAsUtc = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const endOffsetMinutes = getTzOffsetMinutes(TIMEZONE, endLocalAsUtc);
  const endUtc = new Date(
    endLocalAsUtc.getTime() - endOffsetMinutes * 60_000
  );

  return [startUtc.toISOString(), endUtc.toISOString()] as const;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dayParam = url.searchParams.get("day");

    if (dayParam && !isValidDay(dayParam)) {
      return badRequest("Invalid day");
    }

    const day = dayParam || formatLA_YYYY_MM_DD(new Date());

    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }

    const [startIso, endIso] = laDayBoundsUtcIso(day);

    const totalResult = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUser.id);

    if (totalResult.error) {
      console.error("USAGE_STATS_TOTAL_QUERY_FAILED", {
        message: totalResult.error.message,
        userId: authUser.id,
      });
      return serverError("Failed to load usage stats");
    }

    const todayResult = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUser.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (todayResult.error) {
      console.error("USAGE_STATS_TODAY_QUERY_FAILED", {
        message: todayResult.error.message,
        userId: authUser.id,
        day,
      });
      return serverError("Failed to load usage stats");
    }

    return jsonNoStore({
      ok: true,
      stats: {
        today: todayResult.count ?? 0,
        total: totalResult.count ?? 0,
      },
      day,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("USAGE_STATS_ERROR", { message });

    return serverError("Failed to load usage stats");
  }
}