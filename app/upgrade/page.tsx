"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MeUser = {
  id: string;
  email: string;
  isPro?: boolean;
  planType?: string | null;
  isReviewer?: boolean;
  reviewerMode?: "free" | "pro" | null;
};

type PlanType = "monthly" | "yearly";

export default function UpgradePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanType | null>(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function check() {
      try {
        const resp = await fetch("/api/user/me", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        const json = await resp.json().catch(() => ({ user: null }));
        const user: MeUser | null = json?.user ?? null;

        if (!user?.id) {
          router.replace("/sign-in");
          return;
        }

        if (!mountedRef.current) return;

        setMe(user);

        if (user.isPro) {
          router.replace("/");
          return;
        }

        setLoading(false);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;

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

    if (!me?.id) {
      router.replace("/sign-in");
      return;
    }

    if (checkoutLoading) return;

    setCheckoutLoading(type);

    try {
      const res = await fetch("/api/billing/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
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
    <main className="mx-auto max-w-xl p-6">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
      >
        <span aria-hidden>←</span>
        <span>Back to Home</span>
      </button>

      <header className="mb-6">
        <h1 className="mb-2 text-3xl font-bold">Upgrade to ToneMender Pro</h1>
        <p className="text-slate-700">
          Unlock unlimited rewrites, tone control, relationship types, priority
          processing, and access to future premium features.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold">Monthly</h2>
          <p className="mb-1 text-2xl font-bold">$7.99</p>
          <p className="mb-4 text-sm text-slate-600">Billed every month.</p>
          <button
            type="button"
            onClick={() => startCheckout("monthly")}
            disabled={!!checkoutLoading}
            className="w-full rounded-xl bg-blue-600 py-2.5 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkoutLoading === "monthly" ? "Starting..." : "Subscribe Monthly"}
          </button>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold">Yearly</h2>
          <p className="mb-1 text-2xl font-bold">$49.99</p>
          <p className="mb-4 text-sm text-slate-600">
            Billed once per year. Save big vs monthly.
          </p>
          <button
            type="button"
            onClick={() => startCheckout("yearly")}
            disabled={!!checkoutLoading}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
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