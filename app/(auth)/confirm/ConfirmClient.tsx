"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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

function successMessageFor(type: ConfirmType | null) {
  if (type === "signup") {
    return "Your account is now active. You can sign in.";
  }

  if (type === "email-change") {
    return "Your email was updated. Please sign in again using your new email.";
  }

  if (type === "newsletter") {
    return "You’re subscribed. Watch your inbox for updates.";
  }

  return "You're all set.";
}

export default function ConfirmClient() {
  const searchParams = useSearchParams();

  const token = searchParams.get("token");
  const type = useMemo(() => parseType(searchParams.get("type")), [searchParams]);

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

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
        const res = await fetch("/api/auth/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            token,
            ...(type ? { type } : {}),
          }),
        });

        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          ok?: boolean;
          error?: string;
        };

        if (controller.signal.aborted) return;

        if (res.ok && (json.success || json.ok)) {
          setStatus("success");
          return;
        }

        setStatus("error");
        setMessage(json.error || "This confirmation link is invalid or expired.");
      } catch (err: unknown) {
        if (controller.signal.aborted) return;

        console.error("CONFIRM_PAGE_ERROR", err);
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
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
          <p className="text-slate-700">{heading}</p>
        </div>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
          <p className="text-lg font-semibold text-green-600">
            ✅ Confirmation successful
          </p>

          <p className="mt-3 text-sm text-slate-600">
            {successMessageFor(type)}
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            {(type === "signup" || type === "email-change") && (
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                Sign in
              </Link>
            )}

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
        <p className="text-lg font-semibold text-red-600">
          ❌ {message || "This confirmation link is invalid or expired."}
        </p>

        <p className="mt-3 text-sm text-slate-600">
          If you requested this recently, try requesting a new link and check your
          spam or junk folder.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3">
          {type === "signup" && (
            <Link
              href="/sign-up"
              className="text-sm text-blue-600 transition hover:underline"
            >
              Create a new account
            </Link>
          )}

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