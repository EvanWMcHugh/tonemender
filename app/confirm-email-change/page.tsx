"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Status = "loading" | "success" | "error";

export default function ConfirmEmailChangePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus("error");
        setMessage("Missing token.");
        return;
      }

      try {
        const res = await fetch("/api/auth/confirm-email-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setStatus("error");
          setMessage(data?.error || "Confirmation failed.");
          return;
        }

        setStatus("success");
        setMessage("Email successfully confirmed and updated.");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Network error. Please try again.");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-center text-slate-700">Confirming email change…</p>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center px-6">
          <p className="text-green-600 font-semibold text-lg">✅ {message}</p>

          <div className="mt-6 flex flex-col gap-3 items-center">
            <Link href="/account" className="text-sm text-slate-600 hover:underline">
              Go to account
            </Link>
            <Link href="/sign-in" className="text-sm text-slate-600 hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center px-6">
        <p className="text-red-600 font-semibold text-lg">❌ {message || "Invalid or expired link."}</p>

        <div className="mt-6 flex flex-col gap-3 items-center">
          <Link href="/account" className="text-sm text-blue-600 underline">
            Back to account
          </Link>
        </div>
      </div>
    </main>
  );
}