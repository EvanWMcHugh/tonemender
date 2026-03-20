"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type EmailType = "signup" | "email-change" | "password-reset";

const CONTENT: Record<
  EmailType,
  {
    title: string;
    body: string;
    cta: { href: string; label: string };
  }
> = {
  signup: {
    title: "Check your email",
    body: "We just sent you a confirmation link. Please verify your email to activate your account.",
    cta: { href: "/sign-in", label: "Go to Sign In" },
  },
  "email-change": {
    title: "Check your new email",
    body: "We sent a confirmation link to your new email address. Click it to finish updating your email.",
    cta: { href: "/account", label: "Back to account" },
  },
  "password-reset": {
    title: "Check your email",
    body: "We sent a password reset link. Click it to set a new password.",
    cta: { href: "/sign-in", label: "Back to sign in" },
  },
};

function parseType(param: string | null): EmailType {
  if (param === "email-change") return "email-change";
  if (param === "password-reset") return "password-reset";
  return "signup";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default function CheckEmailPage() {
  const searchParams = useSearchParams();
  const type = parseType(searchParams.get("type"));
  const rawEmail = searchParams.get("email") || "";
  const email = useMemo(() => normalizeEmail(rawEmail), [rawEmail]);

  const content = CONTENT[type];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const canResendSignupConfirmation = type === "signup" && !!email;

  async function handleResendSignupConfirmation() {
    if (!email || loading) return;

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const response = await fetch("/api/auth/resend-signup-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error || "Could not resend confirmation email");
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not resend confirmation email"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[360px] text-center">
        <h1 className="mb-4 text-2xl font-bold">{content.title}</h1>

        <p className="mb-4 text-sm leading-relaxed text-slate-700">
          {content.body}
        </p>

        {type === "signup" && email && (
          <p className="mb-4 text-sm text-slate-500">
            Sent to <span className="font-medium text-slate-700">{email}</span>
          </p>
        )}

        <p className="text-sm text-slate-500">
          If you don’t see it, check your spam or junk folder.
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-left">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-left">
            <p className="text-sm text-green-700">
              ✅ Confirmation email sent
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {canResendSignupConfirmation && (
            <button
              type="button"
              onClick={handleResendSignupConfirmation}
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending..." : "Resend confirmation email"}
            </button>
          )}

          <Link
            href={content.cta.href}
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            {content.cta.label}
          </Link>

          <Link
            href="/landing"
            className="text-sm text-slate-600 transition hover:text-slate-800 hover:underline"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}