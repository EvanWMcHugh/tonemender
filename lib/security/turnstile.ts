// lib/security/turnstile.ts
import "server-only";

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 5_000;

export async function verifyTurnstile(
  token: string,
  ip: string | null
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is missing");
    return false;
  }

  if (typeof token !== "string" || token.trim().length === 0) {
    console.error("Turnstile verify called with invalid token");
    return false;
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token.trim());

  if (ip) {
    form.append("remoteip", ip);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  try {
    const resp = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!resp.ok) {
      console.error("Turnstile verify HTTP error", {
        status: resp.status,
      });
      return false;
    }

    const data = (await resp.json()) as TurnstileResponse;

    if (!data.success) {
      console.error("Turnstile verify failed", {
        codes: data["error-codes"] ?? [],
        hostname: data.hostname ?? null,
        action: data.action ?? null,
      });
    }

    return data.success === true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("Turnstile verify error", { message });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}