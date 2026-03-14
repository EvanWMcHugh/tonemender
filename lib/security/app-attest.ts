import crypto from "crypto";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

type VerifyIosAppAttestAssertionArgs = {
  keyId: string;
  assertion: string;
  challengeId: string;
  method: string;
  path: string;
  requestBody: Buffer;
};

type VerifyIosAppAttestAssertionResult = {
  ok: boolean;
  reason: string;
  publicMessage: string;
  payload?: {
    keyId: string;
    challengeId: string;
    clientDataHashHex: string;
  };
};

const APPLE_APP_ID = `${process.env.APPLE_TEAM_ID}.${process.env.APPLE_BUNDLE_ID}`;

function sha256Hex(input: string | Buffer) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomChallengeBase64(size = 32) {
  return crypto.randomBytes(size).toString("base64");
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildAssertionPayload(args: {
  challengeBase64: string;
  method: string;
  path: string;
  requestBody: Buffer;
}) {
  const challengeBytes = Buffer.from(args.challengeBase64, "base64");
  const methodBytes = Buffer.from(args.method.toUpperCase(), "utf8");
  const pathBytes = Buffer.from(normalizePath(args.path), "utf8");
  const separator = Buffer.from([0]);

  return Buffer.concat([
    challengeBytes,
    methodBytes,
    separator,
    pathBytes,
    separator,
    args.requestBody,
  ]);
}

export async function createAppAttestChallenge(params: {
  purpose: "attest" | "assertion";
  keyId?: string | null;
}) {
  const challenge = randomChallengeBase64(32);
  const challengeHash = sha256Hex(Buffer.from(challenge, "base64"));
  const expiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();

  const insertPayload = {
    challenge,
    challenge_hash: challengeHash,
    purpose: params.purpose,
    key_id: params.keyId ?? null,
    expires_at: expiresAt,
  };

  const { data, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Failed to create App Attest challenge");
  }

  return {
    challengeId: data.id as string,
    challenge,
    expiresAt,
  };
}

export async function consumeAppAttestChallengeById(params: {
  challengeId: string;
  purpose: "attest" | "assertion";
  keyId?: string | null;
}) {
  const { data: row, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .select("*")
    .eq("id", params.challengeId)
    .eq("purpose", params.purpose)
    .is("consumed_at", null)
    .maybeSingle();

  if (error || !row) {
    return { ok: false as const, reason: "challenge_not_found" };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false as const, reason: "challenge_expired" };
  }

  if (params.keyId && row.key_id && row.key_id !== params.keyId) {
    return { ok: false as const, reason: "challenge_key_mismatch" };
  }

  const { error: updateError } = await supabaseAdmin
    .from("app_attest_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);

  if (updateError) {
    return { ok: false as const, reason: "challenge_consume_failed" };
  }

  return { ok: true as const, row };
}

export async function consumeAppAttestChallenge(params: {
  challengeBase64: string;
  purpose: "attest" | "assertion";
  keyId?: string | null;
}) {
  const challengeHash = sha256Hex(Buffer.from(params.challengeBase64, "base64"));

  const { data: row, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .select("*")
    .eq("challenge_hash", challengeHash)
    .eq("purpose", params.purpose)
    .is("consumed_at", null)
    .maybeSingle();

  if (error || !row) {
    return { ok: false as const, reason: "challenge_not_found" };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false as const, reason: "challenge_expired" };
  }

  if (params.keyId && row.key_id && row.key_id !== params.keyId) {
    return { ok: false as const, reason: "challenge_key_mismatch" };
  }

  const { error: updateError } = await supabaseAdmin
    .from("app_attest_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);

  if (updateError) {
    return { ok: false as const, reason: "challenge_consume_failed" };
  }

  return { ok: true as const, row };
}

export async function storeAttestedKey(params: {
  keyId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const { error } = await supabaseAdmin.from("app_attest_keys").upsert({
    key_id: params.keyId,
    app_id: APPLE_APP_ID,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    last_seen_at: new Date().toISOString(),
    last_ip: params.ip,
    last_user_agent: params.userAgent,
  });

  if (error) {
    throw new Error("Failed to store attested key");
  }
}

export async function verifyIosAppAttestAssertion({
  keyId,
  assertion,
  challengeId,
  method,
  path,
  requestBody,
}: VerifyIosAppAttestAssertionArgs): Promise<VerifyIosAppAttestAssertionResult> {
  const challengeResult = await consumeAppAttestChallengeById({
    challengeId,
    purpose: "assertion",
    keyId,
  });

  if (!challengeResult.ok) {
    return {
      ok: false,
      reason: challengeResult.reason,
      publicMessage: "Integrity verification failed.",
    };
  }

  const { row } = challengeResult;

  const { data: keyRow, error } = await supabaseAdmin
    .from("app_attest_keys")
    .select("*")
    .eq("key_id", keyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !keyRow) {
    return {
      ok: false,
      reason: "unknown_key",
      publicMessage: "Integrity verification failed.",
    };
  }

  if (!assertion || typeof assertion !== "string") {
    return {
      ok: false,
      reason: "missing_assertion",
      publicMessage: "Integrity verification failed.",
    };
  }

  if (!row.challenge || typeof row.challenge !== "string") {
    return {
      ok: false,
      reason: "missing_challenge_value",
      publicMessage: "Integrity verification failed.",
    };
  }

  const assertionPayload = buildAssertionPayload({
    challengeBase64: row.challenge,
    method,
    path,
    requestBody,
  });

  const clientDataHashHex = sha256Hex(assertionPayload);

  // TODO:
  // Replace this placeholder with real Apple App Attest assertion verification.
  // That verification must prove the assertion is valid for:
  // - the attested key
  // - this app ID / bundle
  // - this exact clientDataHash
  //
  // For now, we only enforce:
  // - known attested key
  // - valid, unexpired, single-use challenge ID
  // - non-empty assertion string

  await supabaseAdmin
    .from("app_attest_keys")
    .update({
      last_seen_at: new Date().toISOString(),
    })
    .eq("key_id", keyId);

  return {
    ok: true,
    reason: "placeholder_verified",
    publicMessage: "ok",
    payload: {
      keyId,
      challengeId,
      clientDataHashHex,
    },
  };
}