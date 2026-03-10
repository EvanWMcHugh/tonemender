"use client";

import Link from "next/link";
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

export default function CheckEmailPage() {
  const searchParams = useSearchParams();
  const type = parseType(searchParams.get("type"));

  const content = CONTENT[type];

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[360px] text-center">
        <h1 className="text-2xl font-bold mb-4">{content.title}</h1>

        <p className="text-sm text-slate-700 mb-4 leading-relaxed">
          {content.body}
        </p>

        <p className="text-sm text-slate-500">
          If you don’t see it, check your spam or junk folder.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={content.cta.href}
            className="inline-flex items-center justify-center w-full rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-semibold hover:bg-blue-500 transition"
          >
            {content.cta.label}
          </Link>

          <Link
            href="/landing"
            className="text-sm text-slate-600 hover:text-slate-800 hover:underline transition"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}