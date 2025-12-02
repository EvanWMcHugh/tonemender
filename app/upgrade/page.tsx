"use client";

import { useState } from "react";

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    setLoading(true);

    const res = await fetch("/api/checkout", {
      method: "POST",
    });

    const { url } = await res.json();

    if (url) {
      window.location.href = url;
    } else {
      alert("Failed to start checkout.");
    }

    setLoading(false);
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Upgrade to ToneMender Pro</h1>

      <p className="mb-6 text-gray-700">
        Get unlimited rewrites, priority processing, and future premium features.
      </p>

      <div className="border p-4 rounded-lg mb-6 bg-gray-50">
        <h2 className="text-xl font-semibold">What You Get</h2>
        <ul className="list-disc ml-6 mt-3">
          <li>Unlimited rewrites</li>
          <li>Faster results</li>
          <li>Saved messages & drafts</li>
          <li>Early access to new tones</li>
        </ul>
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="bg-purple-600 text-white p-3 rounded w-full text-lg"
      >
        {loading ? "Redirecting..." : "Upgrade for $4.99/month"}
      </button>
    </main>
  );
}