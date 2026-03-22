import {
  badRequest,
  jsonNoStore,
  serverError,
} from "@/lib/api/responses";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

type ConfirmType = "signup" | "email-verify" | "email-change" | "newsletter";
type Purpose =
  | "signup_verify"
  | "email_verify"
  | "email_change"
  | "newsletter_confirm";

type ConfirmBody = {
  token?: unknown;
  type?: unknown;
};

type TokenRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  data: unknown;
  expires_at: string | null;
  consumed_at: string | null;
  purpose: Purpose;
};

type ConfirmSuccess =
  | {
      ok: true;
      success: true;
      type: "signup";
      email: string | null;
    }
  | {
      ok: true;
      success: true;
      type: "email-change";
    }
  | {
      ok: true;
      success: true;
      type: "newsletter";
      email: string;
    };

type ConfirmConflict = {
  ok: false;
  error: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseType(raw: unknown): ConfirmType | null {
  if (raw === "signup") return "signup";
  if (raw === "email-verify") return "email-verify";
  if (raw === "email-change") return "email-change";
  if (raw === "newsletter") return "newsletter";
  return null;
}

function isConflictResult(
  value: ConfirmSuccess | ConfirmConflict | null
): value is ConfirmConflict {
  return Boolean(value && value.ok === false);
}

function getTokenDataValue(data: unknown, keys: string[]): string | null {
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

async function consumeAuthToken({
  token,
  purpose,
}: {
  token: string;
  purpose: Purpose;
}): Promise<TokenRow | null> {
  const tokenHash = sha256Hex(token);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("auth_tokens")
    .update({ consumed_at: nowIso })
    .eq("token_hash", tokenHash)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select("id,user_id,email,data,expires_at,consumed_at,purpose")
    .maybeSingle();

  if (error) {
    console.error("CONFIRM_TOKEN_CONSUME_FAILED", {
      purpose,
      message: error.message,
    });
    throw new Error("TOKEN_CONSUME_FAILED");
  }

  if (!data) return null;

  return {
    id: String(data.id),
    user_id: data.user_id ? String(data.user_id) : null,
    email: typeof data.email === "string" ? data.email : null,
    data: data.data ?? null,
    expires_at: data.expires_at ? String(data.expires_at) : null,
    consumed_at: data.consumed_at ? String(data.consumed_at) : null,
    purpose: data.purpose as Purpose,
  };
}

async function bestEffortAudit(
  event: string,
  meta: Record<string, unknown> = {},
  userId?: string | null,
  req?: Request
) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId ?? null,
      event,
      ip: getClientIp(req!),
      user_agent: getUserAgent(req!),
      meta,
    });
  } catch {}
}

/* ------------------ EMAIL VERIFY ------------------ */

async function confirmEmailVerify(
  token: string,
  req: Request
): Promise<ConfirmSuccess | null> {
  const tok =
    (await consumeAuthToken({ token, purpose: "email_verify" }).catch(() => null)) ||
    (await consumeAuthToken({ token, purpose: "signup_verify" }).catch(() => null));

  if (!tok?.user_id) return null;

  const nowIso = new Date().toISOString();

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id,email,email_verified_at")
    .eq("id", tok.user_id)
    .maybeSingle();

  if (!user?.id) throw new Error("USER_LOOKUP_FAILED");

  if (!user.email_verified_at) {
    const { error } = await supabaseAdmin
      .from("users")
      .update({ email_verified_at: nowIso })
      .eq("id", tok.user_id);

    if (error) throw new Error("USER_VERIFY_UPDATE_FAILED");
  }

  await bestEffortAudit("EMAIL_VERIFIED", {}, tok.user_id, req);

  return {
    ok: true,
    success: true,
    type: "signup",
    email: user.email ?? null,
  };
}

/* ------------------ EMAIL CHANGE ------------------ */

async function confirmEmailChange(
  token: string,
  req: Request
): Promise<ConfirmSuccess | ConfirmConflict | null> {
  const tok = await consumeAuthToken({
    token,
    purpose: "email_change",
  }).catch(() => null);

  if (!tok?.user_id) return null;

  const newEmail = normalizeEmail(
    getTokenDataValue(tok.data, ["new_email", "newEmail"]) ?? tok.email ?? ""
  );

  if (!newEmail) throw new Error("EMAIL_CHANGE_BAD_TOKEN");

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", newEmail)
    .maybeSingle();

  if (existing && String(existing.id) !== tok.user_id) {
    return { ok: false, error: "Unable to use that email address." };
  }

  await supabaseAdmin
    .from("users")
    .update({
      email: newEmail,
      email_verified_at: new Date().toISOString(),
    })
    .eq("id", tok.user_id);

  await bestEffortAudit("EMAIL_CHANGE_COMPLETED", {}, tok.user_id, req);

  return { ok: true, success: true, type: "email-change" };
}

/* ------------------ NEWSLETTER ------------------ */

async function confirmNewsletter(
  token: string,
  req: Request
): Promise<ConfirmSuccess | null> {
  const tok = await consumeAuthToken({
    token,
    purpose: "newsletter_confirm",
  }).catch(() => null);

  if (!tok?.email) return null;

  const email = normalizeEmail(tok.email);

  await supabaseAdmin.from("newsletter_subscribers").upsert(
    {
      email,
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirm_token_hash: null,
    },
    { onConflict: "email" }
  );

  await bestEffortAudit("NEWSLETTER_CONFIRMED", { email }, null, req);

  return { ok: true, success: true, type: "newsletter", email };
}

/* ------------------ MAIN ROUTE ------------------ */

export async function POST(req: Request) {
  try {
    let body: ConfirmBody = {};

    try {
      body = (await req.json()) as ConfirmBody;
    } catch {
      return badRequest("Invalid request body");
    }

    const token = body.token;

    if (typeof token !== "string" || !token) {
      return badRequest("Missing token");
    }

    const type = parseType(body.type);
    const normalizedType = type === "signup" ? "email-verify" : type;

    if (normalizedType === "email-verify") {
      const out = await confirmEmailVerify(token, req);
      return out ? jsonNoStore(out) : badRequest("Invalid token");
    }

    if (normalizedType === "email-change") {
      const out = await confirmEmailChange(token, req);
      if (!out) return badRequest("Invalid token");
      if (isConflictResult(out)) return jsonNoStore(out, { status: 400 });
      return jsonNoStore(out);
    }

    if (normalizedType === "newsletter") {
      const out = await confirmNewsletter(token, req);
      return out ? jsonNoStore(out) : badRequest("Invalid token");
    }

    const out =
      (await confirmEmailVerify(token, req).catch(() => null)) ||
      (await confirmEmailChange(token, req).catch(() => null)) ||
      (await confirmNewsletter(token, req).catch(() => null));

    if (!out) return badRequest("Invalid token");

    if (isConflictResult(out)) {
      return jsonNoStore(out, { status: 400 });
    }

    return jsonNoStore(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("CONFIRM_ERROR", { message });

    return serverError("Server error");
  }
}