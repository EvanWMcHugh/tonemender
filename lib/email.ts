// lib/email.ts
import { Resend } from "resend";

type SendEmailOpts = {
  to: string;
  subject: string;
  html: string;
};

const FROM = process.env.EMAIL_FROM || "ToneMender <no-reply@tonemender.com>";

export async function sendEmail({ to, subject, html }: SendEmailOpts): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  // Never crash auth flows because email failed
  if (!apiKey) {
    console.error("EMAIL SEND FAILED: Missing RESEND_API_KEY");
    return false;
  }

  const safeTo = String(to || "").trim();
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

  try {
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: FROM,
      to: safeTo,
      subject: safeSubject,
      html: safeHtml,
    });

    return true;
  } catch (err) {
    console.error("EMAIL SEND FAILED:", err);
    return false;
  }
}