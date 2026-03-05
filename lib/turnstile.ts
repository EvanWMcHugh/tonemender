// lib/turnstile.ts

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

export async function verifyTurnstile(token: string, ip: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is missing");
    return false;
  }

  if (!token || typeof token !== "string") {
    console.error("Turnstile verify called with invalid token");
    return false;
  }

  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: form,
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    const data: TurnstileResponse = await resp.json();

    if (!data.success) {
      console.error("Turnstile verify failed:", {
        codes: data["error-codes"] ?? [],
        hostname: data.hostname ?? null,
        action: data.action ?? null,
      });
    }

    return data.success === true;
  } catch (err) {
    console.error("Turnstile verify error:", err);
    return false;
  }
}