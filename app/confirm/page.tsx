"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Status = "loading" | "success" | "error";

export default function ConfirmPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const type = searchParams.get("type"); // e.g. "email-change"

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      if (!token) {
        setStatus("error");
        setMessage("Missing token.");
        return;
      }

      // ✅ Route based on confirmation type
      const endpoint =
        type === "email-change" ? "/api/auth/confirm-email-change" : "/api/confirm";

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        let json: any = {};
        try {
          json = await res.json();
        } catch {
          json = {};
        }

        if (cancelled) return;

        if (res.ok && (json?.success || json?.ok)) {
          setStatus("success");
          setMessage("");
          return;
        }

        setStatus("error");
        setMessage(json?.error || "This confirmation link is invalid or expired.");
      } catch (err) {
        console.error("CONFIRM PAGE ERROR:", err);
        if (!cancelled) {
          setStatus("error");
          setMessage("This confirmation link is invalid or expired.");
        }
      }
    }

    confirm();

    return () => {
      cancelled = true;
    };
  }, [token, type]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-center text-slate-700">Confirming…</p>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center px-6">
          <p className="text-green-600 font-semibold text-lg">
            ✅ Confirmation successful.
          </p>

          <div className="mt-6 flex flex-col gap-3 items-center">
            <Link href="/landing" className="text-sm text-slate-600 hover:underline">
              Back to home
            </Link>
            {type === "email-change" && (
              <Link href="/sign-in" className="text-sm text-blue-600 underline">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center px-6">
        <p className="text-red-600 font-semibold text-lg">
          ❌ {message || "This confirmation link is invalid or expired."}
        </p>

        <div className="mt-6 flex flex-col gap-3 items-center">
          <Link href="/landing" className="text-sm text-blue-600 underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}