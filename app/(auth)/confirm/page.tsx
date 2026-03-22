"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Status = "loading" | "success" | "error";
type ConfirmType = "signup" | "email-change" | "newsletter";

function parseType(raw: string | null): ConfirmType | null {
  if (raw === "signup") return "signup";
  if (raw === "email-change") return "email-change";
  if (raw === "newsletter") return "newsletter";
  return null;
}

function titleFor(type: ConfirmType | null) {
  if (type === "signup") return "Confirming your account…";
  if (type === "email-change") return "Confirming your new email…";
  if (type === "newsletter") return "Confirming your subscription…";
  return "Confirming…";
}

export default function ConfirmPage() {
  const searchParams = useSearchParams();

  const token = searchParams.get("token");
  const type = useMemo(() => parseType(searchParams.get("type")), [searchParams]);

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      if (!token) {
        setStatus("error");
        setMessage("Missing token.");
        return;
      }

      setStatus("loading");
      setMessage("");

      try {
        // ✅ Single endpoint for all confirmations (auth_tokens-compatible)
        const res = await fetch("/api/auth/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            token,
            // If type is missing/unknown, let the server try to resolve safely.
            ...(type ? { type } : {}),
          }),
        });

        const json = await res.json().catch(() => ({} as any));

        if (controller.signal.aborted) return;

        if (res.ok && (json?.success || json?.ok)) {
          setStatus("success");
          return;
        }

        setStatus("error");
        setMessage(json?.error || "This confirmation link is invalid or expired.");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("CONFIRM PAGE ERROR:", err);
        setStatus("error");
        setMessage("This confirmation link is invalid or expired.");
      }
    }

    void run();

    return () => controller.abort();
  }, [token, type]);

  const heading = titleFor(type);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-6">
        <p className="text-center text-slate-700">{heading}</p>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center max-w-[420px]">
          <p className="text-green-600 font-semibold text-lg">✅ Confirmation successful.</p>

          <p className="text-sm text-slate-600 mt-3">
            {type === "signup"
              ? "Your account is now active. You can sign in."
              : type === "email-change"
              ? "Your email was updated. Please sign in again using your new email."
              : type === "newsletter"
              ? "You’re subscribed. Watch your inbox for updates."
              : "You're all set."}
          </p>

          <div className="mt-6 flex flex-col gap-3 items-center">
            {(type === "signup" || type === "email-change") && (
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-500 transition"
              >
                Sign in
              </Link>
            )}

            <Link href="/landing" className="text-sm text-slate-600 hover:underline">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="text-center max-w-[520px]">
        <p className="text-red-600 font-semibold text-lg">
          ❌ {message || "This confirmation link is invalid or expired."}
        </p>

        <p className="text-sm text-slate-600 mt-3">
          If you requested this recently, try requesting a new link and check your spam/junk folder.
        </p>

        <div className="mt-6 flex flex-col gap-3 items-center">
          {type === "signup" && (
            <Link href="/sign-up" className="text-sm text-blue-600 hover:underline">
              Create a new account
            </Link>
          )}

          <Link href="/landing" className="text-sm text-slate-600 hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}