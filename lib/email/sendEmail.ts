// lib/email/sendEmail.ts
import "server-only";
import { Resend } from "resend";

type SendEmailOpts = {
  to: string;
  subject: string;
  html: string;
};

const DEFAULT_FROM = "ToneMender <no-reply@tonemender.com>";
const FROM = sanitizeFromAddress(process.env.EMAIL_FROM || DEFAULT_FROM);

const MAX_EMAIL_LENGTH = 320;
const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 2_000_000;

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    resend = new Resend(apiKey);
  }

  return resend;
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isProbablyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeSubject(subject: string): string {
  return String(subject || "").replace(/[\r\n]/g, "").trim();
}

function sanitizeFromAddress(value: string): string {
  return String(value || "").replace(/[\r\n]/g, "").trim();
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailOpts): Promise<boolean> {
  const client = getResend();

  // Never crash auth flows because email failed.
  if (!client) {
    console.error("EMAIL_SEND_FAILED_MISSING_RESEND_API_KEY");
    return false;
  }

  const safeTo = normalizeEmail(to);
  const safeSubject = sanitizeSubject(subject);
  const safeHtml = String(html || "").trim();
  const safeFrom = FROM;

  if (!safeTo || !safeSubject || !safeHtml || !safeFrom) {
    console.warn("sendEmail called with missing fields", {
      hasTo: Boolean(safeTo),
      hasSubject: Boolean(safeSubject),
      hasHtml: Boolean(safeHtml),
      hasFrom: Boolean(safeFrom),
    });
    return false;
  }

  if (
    safeTo.length > MAX_EMAIL_LENGTH ||
    safeSubject.length > MAX_SUBJECT_LENGTH ||
    safeHtml.length > MAX_HTML_LENGTH
  ) {
    console.warn("sendEmail rejected due to size limits", {
      toLen: safeTo.length,
      subjectLen: safeSubject.length,
      htmlLen: safeHtml.length,
    });
    return false;
  }

  if (!isProbablyEmail(safeTo) || /[\r\n,]/.test(safeTo)) {
    console.warn("sendEmail rejected invalid recipient", {
      to: safeTo,
    });
    return false;
  }

  if (/[\r\n]/.test(safeFrom)) {
    console.warn("sendEmail rejected invalid from address");
    return false;
  }

  try {
    const { error } = await client.emails.send({
      from: safeFrom,
      to: safeTo,
      subject: safeSubject,
      html: safeHtml,
    });

    if (error) {
      console.error("EMAIL_SEND_FAILED_PROVIDER_ERROR", {
        name: error.name,
        message: error.message,
      });
      return false;
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("EMAIL_SEND_FAILED_EXCEPTION", { message });
    return false;
  }
}