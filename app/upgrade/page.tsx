"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isProReviewer } from "../../lib/reviewers";

type MeUser = {
  id: string;
  email: string;
  isPro?: boolean;
  planType?: string | null;
};

export default function UpgradePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true); // while checking auth + pro status
  const [error, setError] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);

  const reviewerIsPro = useMemo(() => {
    const email = (me?.email ?? "").trim().toLowerCase();
    return isProReviewer(email);
  }, [me?.email]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const resp = await fetch("/api/me", { method: "GET" });
        const json = await resp.json().catch(() => ({ user: null }));
        const user: MeUser | null = json?.user ?? null;

        // Not logged in → go to sign-in
        if (!user?.id) {
          router.replace("/sign-in");
          return;
        }

        if (cancelled) return;

        setMe(user);

        // Reviewer pro accounts should never see upgrade page
        if (isProReviewer(user.email ?? "")) {
          router.replace("/");
          return;
        }

        // Already pro → send home
        if (user.isPro) {
          router.replace("/");
          return;
        }

        setLoading(false);
      } catch (err) {
        console.error("UPGRADE CHECK ERROR:", err);
        if (!cancelled) {
          setError("Could not verify your account. Please try again.");
          setLoading(false);
        }
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function startCheckout(type: "monthly" | "yearly") {
    setError("");

    // extra guard
    if (!me?.id) {
      router.replace("/sign-in");
      return;
    }

    if (reviewerIsPro) {
      router.replace("/");
      return;
    }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ cookie-auth now; no Authorization header
        body: JSON.stringify({ type }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.url) {
        setError(json?.error || "Could not start checkout.");
        return;
      }

      window.location.href = json.url;
    } catch (err) {
      console.error("CHECKOUT START ERROR:", err);
      setError("Network error. Please try again.");
    }
  }

  if (loading) {
    return <main className="p-6 text-center">Checking your account…</main>;
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-sm text-slate-600 hover:underline"
      >
        ← Back to Home
      </button>

      <h1 className="text-3xl font-bold mb-4">Upgrade to ToneMender Pro</h1>

      <p className="mb-4 text-slate-700">
        Unlock unlimited rewrites, priority processing, and access to all future
        premium features.
      </p>

      {error && <p className="mb-3 text-red-500 text-sm">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        {/* Monthly plan */}
        <div className="border rounded-2xl p-5 bg-white shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Monthly</h2>
          <p className="text-2xl font-bold mb-1">$7.99</p>
          <p className="text-sm text-slate-600 mb-4">Billed every month.</p>
          <button
            onClick={() => startCheckout("monthly")}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-500 transition"
          >
            Subscribe Monthly
          </button>
        </div>

        {/* Yearly plan */}
        <div className="border rounded-2xl p-5 bg-white shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Yearly</h2>
          <p className="text-2xl font-bold mb-1">$49.99</p>
          <p className="text-sm text-slate-600 mb-4">
            Billed once per year. Save big vs monthly.
          </p>
          <button
            onClick={() => startCheckout("yearly")}
            className="w-full bg-emerald-600 text-white py-2.5 rounded-xl hover:bg-emerald-500 transition"
          >
            Subscribe Yearly
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        You can cancel anytime from your account page after subscribing.
      </p>
    </main>
  );
}