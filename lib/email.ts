// lib/emails.ts
import { Resend } from "resend";

type SendEmailOpts = {
  to: string;
  subject: string;
  html: string;
};

const FROM = process.env.EMAIL_FROM || "ToneMender <no-reply@tonemender.com>";

function normalizeEmail(value: string) {
  return String(value || "").trim();
}

function isProbablyEmail(value: string) {
  // Lightweight sanity check (not strict RFC; avoids obvious garbage)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailOpts): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  // Never crash auth flows because email failed
  if (!apiKey) {
    console.error("EMAIL SEND FAILED: Missing RESEND_API_KEY");
    return false;
  }

  const safeTo = normalizeEmail(to);
  const safeSubject = String(subject || "").trim();
  const safeHtml = String(html || "").trim();

  if (!safeTo || !safeSubject || !safeHtml) {
    console.warn("sendEmail called with missing fields", {
      to: safeTo,
      subject: safeSubject,
      hasHtml: Boolean(safeHtml),
    });
    return false;
  }

  // Prevent obvious mistakes / injection-ish values (commas, newlines, etc.)
  if (safeTo.length > 320 || safeSubject.length > 200 || safeHtml.length > 2_000_000) {
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
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
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