"use client";

import { useState } from "react";

export default function UpgradePage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function subscribe(type: "monthly" | "yearly") {
    setLoading(type);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Upgrade failed.");
        setLoading(null);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      console.error("SUBSCRIBE ERROR:", err);
      alert("Network error. Try again.");
      setLoading(null);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Upgrade to ToneMender Pro</h1>

      <p className="mb-6 text-gray-700">
        Unlock unlimited rewrites, unlimited saved drafts, and Pro-only features.
      </p>

      <div className="space-y-4">

        {/* MONTHLY */}
        <button
          onClick={() => subscribe("monthly")}
          className="bg-blue-600 text-white px-4 py-3 rounded w-full text-left"
          disabled={loading !== null}
        >
          {loading === "monthly"
            ? "Redirecting..."
            : "Subscribe Monthly — $7.99 / month"}
        </button>

        {/* YEARLY */}
        <button
          onClick={() => subscribe("yearly")}
          className="bg-green-600 text-white px-4 py-3 rounded w-full text-left"
          disabled={loading !== null}
        >
          {loading === "yearly"
            ? "Redirecting..."
            : "Subscribe Yearly — $49.99 / year"}
        </button>
      </div>

      {/* BACK BUTTON */}
      <button
        className="mt-6 text-blue-600 underline"
        onClick={() => (window.location.href = "/")}
      >
        ← Back to Home
      </button>
    </main>
  );
}