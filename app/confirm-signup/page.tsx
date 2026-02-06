"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ConfirmSignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
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
        const resp = await fetch("/api/auth/confirm-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const json = await resp.json().catch(() => ({}));

        if (!resp.ok || !json?.ok) {
          throw new Error(json?.error || "Confirmation failed");
        }

        if (!cancelled) {
          setStatus("ok");
          setMessage("Email confirmed! You can sign in now.");
          // optional redirect after a moment:
          setTimeout(() => router.replace("/sign-in"), 800);
        }
      } catch (e: any) {
        if (!cancelled) {
          setStatus("error");
          setMessage(e?.message || "Confirmation failed");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[420px] text-center">
        <h1 className="text-2xl font-bold mb-3">Confirm Email</h1>

        {status === "loading" && <p className="text-slate-700">Confirming…</p>}
        {status !== "loading" && (
          <p className={status === "ok" ? "text-green-700" : "text-red-600"}>{message}</p>
        )}

        <div className="mt-6">
          <Link href="/sign-in" className="text-blue-600 underline">
            Go to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}