// lib/security/play-integrity.ts
import "server-only";
import crypto from "crypto";

type VerifyAndroidPlayIntegrityArgs = {
  integrityToken: string;
  expectedPackageName: string;
  expectedRequestHash: string;
  maxAgeMs?: number;
};

type PlayIntegrityPayload = {
  requestDetails?: {
    requestPackageName?: string;
    requestHash?: string;
    timestampMillis?: string | number;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
    certificateSha256Digest?: string[];
    versionCode?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
  };
  accountDetails?: Record<string, unknown>;
  [key: string]: unknown;
};

type VerifyAndroidPlayIntegrityResult = {
  ok: boolean;
  reason: string;
  publicMessage: string;
  payload?: PlayIntegrityPayload;
};

type GoogleAccessTokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

const PLAY_INTEGRITY_SCOPE =
  "https://www.googleapis.com/auth/playintegrity";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PLAY_INTEGRITY_API_BASE = "https://playintegrity.googleapis.com/v1";
const FETCH_TIMEOUT_MS = 15_000;
const ACCESS_TOKEN_SKEW_SECONDS = 60;

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeReadJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const nowMs = Date.now();

  if (cachedAccessToken && nowMs < cachedAccessTokenExpiresAt) {
    return cachedAccessToken;
  }

  const clientEmail = getEnv("GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(
    getEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
  );

  const now = Math.floor(nowMs / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const claimSet = {
    iss: clientEmail,
    scope: PLAY_INTEGRITY_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claimSet)
  )}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();

  const signature = signer.sign(privateKey);
  const jwt = `${unsignedJwt}.${base64Url(signature)}`;

  const tokenRes = await fetchWithTimeout(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const text = await safeReadText(tokenRes);
    throw new Error(
      `Failed to get Google access token (status ${tokenRes.status})${
        text ? `: ${text.slice(0, 500)}` : ""
      }`
    );
  }

  const tokenJson = await safeReadJson<GoogleAccessTokenResponse>(tokenRes);

  if (!tokenJson?.access_token || typeof tokenJson.access_token !== "string") {
    throw new Error("Google access token missing from response");
  }

  const expiresIn = Math.max(
    0,
    Number(tokenJson.expires_in ?? 3600) - ACCESS_TOKEN_SKEW_SECONDS
  );

  cachedAccessToken = tokenJson.access_token;
  cachedAccessTokenExpiresAt = Date.now() + expiresIn * 1000;

  return cachedAccessToken;
}

async function decodeIntegrityToken(
  packageName: string,
  integrityToken: string
): Promise<Record<string, unknown>> {
  if (!isNonEmptyString(packageName)) {
    throw new Error("packageName is required");
  }

  if (!isNonEmptyString(integrityToken)) {
    throw new Error("integrityToken is required");
  }

  const accessToken = await getGoogleAccessToken();

  const decodeRes = await fetchWithTimeout(
    `${PLAY_INTEGRITY_API_BASE}/${encodeURIComponent(
      packageName
    )}:decodeIntegrityToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        integrity_token: integrityToken,
      }),
    }
  );

  if (!decodeRes.ok) {
    const text = await safeReadText(decodeRes);
    throw new Error(
      `Play Integrity decode failed (status ${decodeRes.status})${
        text ? `: ${text.slice(0, 500)}` : ""
      }`
    );
  }

  const json = await safeReadJson<Record<string, unknown>>(decodeRes);
  if (!json) {
    throw new Error("Play Integrity decode returned invalid JSON");
  }

  return json;
}

export async function verifyAndroidPlayIntegrity({
  integrityToken,
  expectedPackageName,
  expectedRequestHash,
  maxAgeMs = 2 * 60 * 1000,
}: VerifyAndroidPlayIntegrityArgs): Promise<VerifyAndroidPlayIntegrityResult> {
  if (!isNonEmptyString(integrityToken)) {
    return {
      ok: false,
      reason: "missing_integrity_token",
      publicMessage: "Integrity verification failed.",
    };
  }

  if (!isNonEmptyString(expectedPackageName)) {
    return {
      ok: false,
      reason: "missing_expected_package_name",
      publicMessage: "Integrity verification failed.",
    };
  }

  if (!isNonEmptyString(expectedRequestHash)) {
    return {
      ok: false,
      reason: "missing_expected_request_hash",
      publicMessage: "Integrity verification failed.",
    };
  }

  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return {
      ok: false,
      reason: "invalid_max_age",
      publicMessage: "Integrity verification failed.",
    };
  }

  try {
    const decoded = await decodeIntegrityToken(
      expectedPackageName,
      integrityToken
    );

    const payload =
      (decoded.tokenPayloadExternal as PlayIntegrityPayload | undefined) ||
      (decoded.tokenPayload as PlayIntegrityPayload | undefined) ||
      null;

    if (!payload) {
      return {
        ok: false,
        reason: "missing_payload",
        publicMessage: "Integrity verification failed.",
      };
    }

    const requestDetails = payload.requestDetails ?? {};
    const appIntegrity = payload.appIntegrity ?? {};
    const deviceIntegrity = payload.deviceIntegrity ?? {};

    const requestPackageName = requestDetails.requestPackageName;
    const requestHash = requestDetails.requestHash;
    const timestampMillisRaw = requestDetails.timestampMillis;

    if (requestPackageName !== expectedPackageName) {
      return {
        ok: false,
        reason: "package_mismatch",
        publicMessage: "Integrity verification failed.",
        payload,
      };
    }

    if (requestHash !== expectedRequestHash) {
      return {
        ok: false,
        reason: "request_hash_mismatch",
        publicMessage: "Integrity verification failed.",
        payload,
      };
    }

    const timestampMillis = Number(timestampMillisRaw);

    if (!Number.isFinite(timestampMillis)) {
      return {
        ok: false,
        reason: "bad_timestamp",
        publicMessage: "Integrity verification failed.",
        payload,
      };
    }

    if (Math.abs(Date.now() - timestampMillis) > maxAgeMs) {
      return {
        ok: false,
        reason: "stale_token",
        publicMessage: "Integrity check expired. Please try again.",
        payload,
      };
    }

    const appRecognitionVerdict = appIntegrity.appRecognitionVerdict;

    if (appRecognitionVerdict !== "PLAY_RECOGNIZED") {
      return {
        ok: false,
        reason: "app_not_play_recognized",
        publicMessage: "App integrity check failed.",
        payload,
      };
    }

    const deviceRecognitionVerdict = Array.isArray(
      deviceIntegrity.deviceRecognitionVerdict
    )
      ? deviceIntegrity.deviceRecognitionVerdict
      : [];

    if (deviceRecognitionVerdict.length === 0) {
      return {
        ok: false,
        reason: "device_not_recognized",
        publicMessage: "Device integrity check failed.",
        payload,
      };
    }

    return {
      ok: true,
      reason: "ok",
      publicMessage: "ok",
      payload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("PLAY_INTEGRITY_VERIFY_ERROR", { message });

    return {
      ok: false,
      reason: "verification_exception",
      publicMessage: "Integrity verification failed.",
    };
  }
}