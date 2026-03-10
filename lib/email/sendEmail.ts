// lib/emails.ts
import { Resend } from "resend";

type SendEmailOpts = {
  to: string;
  subject: string;
  html: string;
};

const FROM = process.env.EMAIL_FROM || "ToneMender <no-reply@tonemender.com>";
const MAX_EMAIL_LENGTH = 320;

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    resend = new Resend(apiKey);
  }
  return resend;
}

function normalizeEmail(value: string) {
  return String(value || "").trim();
}

function isProbablyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeSubject(subject: string) {
  return String(subject || "").replace(/[\r\n]/g, "").trim();
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailOpts): Promise<boolean> {

  const client = getResend();

  // Never crash auth flows because email failed
  if (!client) {
    console.error("EMAIL SEND FAILED: Missing RESEND_API_KEY");
    return false;
  }

  const safeTo = normalizeEmail(to);
  const safeSubject = sanitizeSubject(subject);
  const safeHtml = String(html || "").trim();

  if (!safeTo || !safeSubject || !safeHtml) {
    console.warn("sendEmail called with missing fields", {
      to: safeTo,
      subject: safeSubject,
      hasHtml: Boolean(safeHtml),
    });
    return false;
  }

  if (
    safeTo.length > MAX_EMAIL_LENGTH ||
    safeSubject.length > 200 ||
    safeHtml.length > 2_000_000
  ) {
    console.warn("sendEmail rejected due to size limits", {
      toLen: safeTo.length,
      subjectLen: safeSubject.length,
      htmlLen: safeHtml.length,
    });
    return false;
  }

  if (!isProbablyEmail(safeTo) || /[\r\n,]/.test(safeTo)) {
    console.warn("sendEmail rejected invalid recipient", { to: safeTo });
    return false;
  }

  try {
    const { error } = await client.emails.send({
      from: FROM,
      to: safeTo,
      subject: safeSubject,
      html: safeHtml,
    });

    if (error) {
      console.error("EMAIL SEND FAILED:", error);
      return false;
    }

    return true;

  } catch (err) {
    console.error("EMAIL SEND FAILED:", err);
    return false;
  }
}