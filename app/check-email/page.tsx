"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type EmailType = "signup" | "email-change" | "password-reset";

export default function CheckEmailPage() {
  const searchParams = useSearchParams();
  const type = (searchParams.get("type") as EmailType) || "signup";

  const content =
    type === "email-change"
      ? {
          title: "Check your new email",
          body: "We sent a confirmation link to your new email address. Click it to finish updating your email.",
          cta: { href: "/account", label: "Back to account" },
        }
      : type === "password-reset"
      ? {
          title: "Check your email",
          body: "We sent a password reset link. Click it to set a new password.",
          cta: { href: "/sign-in", label: "Back to sign in" },
        }
      : {
          title: "Check your email",
          body: "We just sent you a confirmation link. Please verify your email to activate your account.",
          cta: { href: "/sign-in", label: "Go to Sign In" },
        };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px] text-center">
        <h1 className="text-2xl font-bold mb-4">{content.title}</h1>

        <p className="text-sm mb-4 text-slate-700">{content.body}</p>

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

          <Link href="/landing" className="text-sm text-slate-600 hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}