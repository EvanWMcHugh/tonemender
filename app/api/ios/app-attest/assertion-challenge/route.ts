import { NextResponse } from "next/server";
import { createAppAttestChallenge } from "@/lib/security/app-attest";

export const runtime = "nodejs";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getPlatform(req: Request) {
  return req.headers.get("x-client-platform") ?? null;
}

export async function POST(req: Request) {
  try {
    const platform = getPlatform(req);

    if (platform !== "ios") {
      return jsonNoStore({ error: "Invalid client platform" }, { status: 403 });
    }

    const result = await createAppAttestChallenge({
      purpose: "assertion",
    });

    return jsonNoStore({
      challengeId: result.challengeId,
      challenge: result.challenge,
    });
  } catch {
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}