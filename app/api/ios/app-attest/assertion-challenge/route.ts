import { NextResponse } from "next/server";
import { createAppAttestChallenge } from "@/lib/security/app-attest";

export const runtime = "nodejs";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const keyId = typeof body?.keyId === "string" ? body.keyId : null;
    const requestHash = typeof body?.requestHash === "string" ? body.requestHash : null;

    const result = await createAppAttestChallenge({
      purpose: "assertion",
      keyId,
      requestHash,
    });

    return jsonNoStore(result);
  } catch {
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}