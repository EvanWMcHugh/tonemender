"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { isProReviewer } from "../../lib/reviewers";

export default function UpgradePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true); // while checking auth + pro status
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;

        // Not logged in → go to sign-in
        if (!user) {
          router.replace("/sign-in");
          return;
        }

        // Reviewer pro accounts should never see upgrade page
        if (isProReviewer(user.email ?? null)) {
          router.replace("/");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("is_pro")
          .eq("id", user.id)
          .single();

        if (!cancelled) {
          if (profile?.is_pro) {
            router.replace("/");
            return;
          }
          setLoading(false);
        }
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

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setError("You must be logged in to upgrade.");
      return;
    }

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // header-first (your API supports it)
      },
      body: JSON.stringify({ type }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.url) {
      setError(json?.error || "Could not start checkout.");
      return;
    }

    window.location.href = json.url;
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