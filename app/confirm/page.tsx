"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Status = "loading" | "success" | "error";

export default function ConfirmPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      if (!token) {
        setStatus("error");
        return;
      }

      try {
        const res = await fetch("/api/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (cancelled) return;

        setStatus(res.ok ? "success" : "error");
      } catch (err) {
        console.error("CONFIRM PAGE ERROR:", err);
        if (!cancelled) setStatus("error");
      }
    }

    confirm();

    return () => {
      cancelled = true;
    };
  }, [token]);

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
            ✅ You’re in! Thanks for joining ToneMender.
          </p>

          <div className="mt-6 flex flex-col gap-3 items-center">
            <Link
              href="/landing"
              className="text-sm text-slate-600 hover:underline"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center px-6">
        <p className="text-red-600 font-semibold text-lg">
          ❌ This confirmation link is invalid or expired.
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