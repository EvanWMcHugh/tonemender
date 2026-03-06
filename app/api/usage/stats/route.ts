import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

const SESSION_COOKIE = "tm_session";
const TIMEZONE = "America/Los_Angeles";

function jsonNoStore(data: unknown, init?: ResponseInit) {
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
  const rawSessionToken = readCookie(req, SESSION_COOKIE);
  if (!rawSessionToken) return null;

  const sessionTokenHash = sha256Hex(rawSessionToken);
  const nowIso = new Date().toISOString();

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at,revoked_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionError || !session?.user_id) return null;
  if (session.revoked_at) return null;
  if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) return null;

  try {
    await supabaseAdmin
      .from("sessions")
      .update({ last_seen_at: nowIso })
      .eq("session_token_hash", sessionTokenHash)
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

    const userId = await getUserIdFromSession(req);
    if (!userId) {
      return jsonNoStore({ stats: { today: 0, total: 0 }, day });
    }

    const { count: total, error: totalError } = await supabaseAdmin
      .from("rewrite_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (totalError) {
      return jsonNoStore({ stats: { today: 0, total: 0 }, day });
    }

    const [startIso, endIso] = laDayBoundsUtcIso(day);

    const { count: today, error: todayError } = await supabaseAdmin
      .from("rewrite_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (todayError) {
      return jsonNoStore({
        stats: {
          today: 0,
          total: total ?? 0,
        },
        day,
      });
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