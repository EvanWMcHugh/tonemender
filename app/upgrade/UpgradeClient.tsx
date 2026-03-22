"use client";

import Link from "next/link";
import { useState } from "react";

type PlanType = "monthly" | "yearly";

export default function UpgradeClient() {
  const [checkoutLoading, setCheckoutLoading] = useState<PlanType | null>(null);
  const [error, setError] = useState("");

  async function startCheckout(type: PlanType) {
    if (checkoutLoading) return;

    setError("");
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
    } catch (error: unknown) {
      console.error("CHECKOUT_START_ERROR", error);
      setError("Network error. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
      >
        <span aria-hidden>←</span>
        <span>Back to Home</span>
      </Link>

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
            onClick={() => void startCheckout("monthly")}
            disabled={Boolean(checkoutLoading)}
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
            onClick={() => void startCheckout("yearly")}
            disabled={Boolean(checkoutLoading)}
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