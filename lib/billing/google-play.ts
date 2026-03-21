// lib/billing/google-play.ts
import "server-only";
import crypto from "crypto";

const ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_PLAY_API_BASE = "https://androidpublisher.googleapis.com";
const FETCH_TIMEOUT_MS = 15_000;
const ACCESS_TOKEN_SKEW_SECONDS = 60;

type GoogleAccessTokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

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

async function getGoogleAccessToken(scope: string): Promise<string> {
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
    scope,
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

export function getGooglePlayPackageName(): string {
  return getEnv("GOOGLE_PLAY_PACKAGE_NAME");
}

export async function getGooglePlaySubscription({
  packageName,
  purchaseToken,
}: {
  packageName: string;
  purchaseToken: string;
}): Promise<unknown> {
  if (!isNonEmptyString(packageName)) {
    throw new Error("packageName is required");
  }

  if (!isNonEmptyString(purchaseToken)) {
    throw new Error("purchaseToken is required");
  }

  const accessToken = await getGoogleAccessToken(ANDROID_PUBLISHER_SCOPE);

  const url =
    `${GOOGLE_PLAY_API_BASE}/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/` +
    `${encodeURIComponent(purchaseToken)}`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await safeReadText(res);
    throw new Error(
      `Google Play subscription lookup failed (status ${res.status})${
        text ? `: ${text.slice(0, 500)}` : ""
      }`
    );
  }

  const json = await safeReadJson<unknown>(res);
  if (!json) {
    throw new Error("Google Play subscription lookup returned invalid JSON");
  }

  return json;
}