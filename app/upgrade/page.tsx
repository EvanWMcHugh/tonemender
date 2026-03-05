"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isProReviewer } from "../../lib/reviewers";

type MeUser = {
  id: string;
  email: string;
  isPro?: boolean;
  planType?: string | null;
};

type PlanType = "monthly" | "yearly";

function normalizeEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

export default function UpgradePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true); // while checking auth + pro status
  const [checkoutLoading, setCheckoutLoading] = useState<PlanType | null>(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);

  const mountedRef = useRef(true);

  const reviewerIsPro = useMemo(() => {
    return isProReviewer(normalizeEmail(me?.email));
  }, [me?.email]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function check() {
      try {
        const resp = await fetch("/api/me", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await resp.json().catch(() => ({ user: null }));
        const user: MeUser | null = json?.user ?? null;

        // Not logged in → go to sign-in
        if (!user?.id) {
          router.replace("/sign-in");
          return;
        }

        if (!mountedRef.current) return;

        setMe(user);

        // Reviewer pro accounts should never see upgrade page
        if (isProReviewer(normalizeEmail(user.email))) {
          router.replace("/");
          return;
        }

        // Already pro → send home
        if (user.isPro) {
          router.replace("/");
          return;
        }

        setLoading(false);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("UPGRADE CHECK ERROR:", err);
        if (mountedRef.current) {
          setError("Could not verify your account. Please try again.");
          setLoading(false);
        }
      }
    }

    check();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [router]);

  async function startCheckout(type: PlanType) {
    setError("");

    // extra guards
    if (!me?.id) {
      router.replace("/sign-in");
      return;
    }
    if (reviewerIsPro) {
      router.replace("/");
      return;
    }
    if (checkoutLoading) return;

    setCheckoutLoading(type);

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
    } finally {
      if (mountedRef.current) setCheckoutLoading(null);
    }
  }

  if (loading) {
    return <main className="p-6 text-center">Checking your account…</main>;
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mb-4 text-sm text-slate-600 hover:underline inline-flex items-center gap-1"
      >
        <span aria-hidden>←</span>
        <span>Back to Home</span>
      </button>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Upgrade to ToneMender Pro</h1>
        <p className="text-slate-700">
          Unlock unlimited rewrites, tone control, relationship types, priority
          processing, and access to future premium features.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Monthly plan */}
        <div className="border rounded-2xl p-5 bg-white shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Monthly</h2>
          <p className="text-2xl font-bold mb-1">$7.99</p>
          <p className="text-sm text-slate-600 mb-4">Billed every month.</p>
          <button
            type="button"
            onClick={() => startCheckout("monthly")}
            disabled={!!checkoutLoading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {checkoutLoading === "monthly" ? "Starting..." : "Subscribe Monthly"}
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
            type="button"
            onClick={() => startCheckout("yearly")}
            disabled={!!checkoutLoading}
            className="w-full bg-emerald-600 text-white py-2.5 rounded-xl hover:bg-emerald-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {checkoutLoading === "yearly" ? "Starting..." : "Subscribe Yearly"}
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        You can cancel anytime from your account page after subscribing.
      </p>
    </main>
  );
}