import { NextResponse } from "next/server";
import { createAppAttestChallenge } from "@/lib/security/app-attest";

export const runtime = "nodejs";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST() {
  try {
    const result = await createAppAttestChallenge({ purpose: "attest" });
    return jsonNoStore(result);
  } catch {
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}