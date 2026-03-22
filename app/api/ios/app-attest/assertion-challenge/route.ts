import { forbidden, jsonNoStore, serverError } from "@/lib/api/responses";
import { getClientPlatform } from "@/lib/request/client-meta";
import { createAppAttestChallenge } from "@/lib/security/app-attest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (getClientPlatform(req) !== "ios") {
      return forbidden("Invalid client platform");
    }

    const result = await createAppAttestChallenge({
      purpose: "assertion",
    });

    return jsonNoStore({
      ok: true,
      challengeId: result.challengeId,
      challenge: result.challenge,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("APP_ATTEST_ASSERTION_CHALLENGE_ERROR", { message });

    return serverError("Server error");
  }
}