import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = process.env.EMAIL_FROM || "ToneMender <no-reply@tonemender.com>";

type SendEmailOpts = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailOpts) {
  if (!to || !subject || !html) {
    console.warn("sendEmail called with missing fields", { to, subject });
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });
  } catch (err) {
    // Never crash auth flows because email failed
    console.error("EMAIL SEND FAILED:", err);
  }
}