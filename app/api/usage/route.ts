import { jsonNoStore, serverError, unauthorized } from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const runtime = "nodejs";

const TIMEZONE = "America/Los_Angeles";
const DAILY_FREE_LIMIT = 3;

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

function laDayBoundsUtcIso(date = new Date()): readonly [string, string] {
  const ymd = formatLA_YYYY_MM_DD(date);
  const [year, month, day] = ymd
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

async function getUsedToday(userId: string): Promise<number> {
  const [startIso, endIso] = laDayBoundsUtcIso(new Date());

  const { count, error } = await supabaseAdmin
    .from("rewrite_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) {
    throw new Error("Usage check failed");
  }

  return count ?? 0;
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }

    if (authUser.isPro) {
      return jsonNoStore({
        ok: true,
        is_pro: true,
        plan_type: authUser.planType,
        day: formatLA_YYYY_MM_DD(new Date()),
        free_limit: DAILY_FREE_LIMIT,
        rewrites_today: 0,
        rewrites_left: null,
      });
    }

    const usedToday = await getUsedToday(authUser.id);

    return jsonNoStore({
      ok: true,
      is_pro: false,
      plan_type: authUser.planType,
      day: formatLA_YYYY_MM_DD(new Date()),
      free_limit: DAILY_FREE_LIMIT,
      rewrites_today: usedToday,
      rewrites_left: Math.max(DAILY_FREE_LIMIT - usedToday, 0),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server error while loading usage";

    if (message === "Usage check failed") {
      return serverError(message);
    }

    return serverError("Server error while loading usage");
  }
}