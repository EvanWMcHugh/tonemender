// lib/api/responses.ts
import "server-only";
import { NextResponse } from "next/server";

export function jsonNoStore(data: unknown, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function ok(data: Record<string, unknown> = {}, init?: ResponseInit): NextResponse {
  return jsonNoStore({ ok: true, ...data }, init);
}

export function badRequest(error = "Bad request"): NextResponse {
  return jsonNoStore({ ok: false, error }, { status: 400 });
}

export function unauthorized(error = "Unauthorized"): NextResponse {
  return jsonNoStore({ ok: false, error }, { status: 401 });
}

export function forbidden(error = "Forbidden"): NextResponse {
  return jsonNoStore({ ok: false, error }, { status: 403 });
}

export function notFound(error = "Not found"): NextResponse {
  return jsonNoStore({ ok: false, error }, { status: 404 });
}

export function tooManyRequests(error = "Too many requests"): NextResponse {
  return jsonNoStore({ ok: false, error }, { status: 429 });
}

export function serverError(error = "Server error"): NextResponse {
  return jsonNoStore({ ok: false, error }, { status: 500 });
}