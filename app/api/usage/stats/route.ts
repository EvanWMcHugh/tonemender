import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";
const TIMEZONE = "America/Los_Angeles";

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
  const nowIso = new Date().toISOString();

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at,revoked_at")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (error || !session?.user_id) return null;
  if (session.revoked_at) return null;
  if (!session.expires_at || session.expires_at <= nowIso) return null;

  // Best-effort last_seen_at
  try {
    await supabaseAdmin
      .from("sessions")
      .update({ last_seen_at: nowIso })
      .eq("session_token_hash", hash)
      .is("revoked_at", null);
  } catch {}

  return String(session.user_id);
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
  }).format(date); // YYYY-MM-DD
}

function getTzOffsetMinutes(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = parseInt(m[2], 10);
  const mm = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (hh * 60 + mm);
}

/**
 * Given an LA day string YYYY-MM-DD, compute UTC bounds [start,end).
 * DST-safe by computing offset at start and end instants.
 */
function laDayBoundsUtcIso(dayYYYYMMDD: string) {
  const [y, m, d] = dayYYYYMMDD.split("-").map((x) => parseInt(x, 10));

  const startLocalAsUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const startOffsetMin = getTzOffsetMinutes(TIMEZONE, startLocalAsUtc);
  const startUtc = new Date(startLocalAsUtc.getTime() - startOffsetMin * 60_000);

  const endLocalAsUtc = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  const endOffsetMin = getTzOffsetMinutes(TIMEZONE, endLocalAsUtc);
  const endUtc = new Date(endLocalAsUtc.getTime() - endOffsetMin * 60_000);

  return [startUtc.toISOString(), endUtc.toISOString()] as const;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // If day not provided, use "today in LA" computed server-side (correct).
    const dayParam = url.searchParams.get("day");
    const day = dayParam && isValidDay(dayParam) ? dayParam : formatLA_YYYY_MM_DD(new Date());

    // Keep UI simple: always return stats payload
    const userId = await getUserIdFromSession(req);
    if (!userId) return jsonNoStore({ stats: { today: 0, total: 0 }, day }, { status: 200 });

    // Total rewrites
    const { count: total, error: totalErr } = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (totalErr) return jsonNoStore({ stats: { today: 0, total: 0 }, day }, { status: 200 });

    // Today (or requested day) in LA bounds
    const [startIso, endIso] = laDayBoundsUtcIso(day);

    const { count: today, error: todayErr } = await supabaseAdmin
      .from("rewrite_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (todayErr) return jsonNoStore({ stats: { today: 0, total: total ?? 0 }, day }, { status: 200 });

    return jsonNoStore({
      stats: { today: today ?? 0, total: total ?? 0 },
      day,
    });
  } catch (err) {
    console.error("USAGE STATS ERROR:", err);
    return jsonNoStore({ stats: { today: 0, total: 0 } }, { status: 200 });
  }
}