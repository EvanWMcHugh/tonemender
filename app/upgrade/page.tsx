"use client";

import Link from "next/link";

export default function UpgradePage() {
  async function subscribe(type: "monthly" | "yearly") {
    const res = await fetch(`/api/checkout?price=${type}`);
    const json = await res.json();
    if (json.url) {
      window.location.href = json.url;
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Upgrade to ToneMender Pro</h1>

      <p className="mb-6 text-gray-700">
        Unlock <strong>unlimited rewrites</strong> and remove all limits.
      </p>

      <div className="flex flex-col gap-6">

        {/* Monthly Plan */}
        <button
          onClick={() => subscribe("monthly")}
          className="bg-blue-600 text-white p-4 rounded-lg shadow"
        >
          Subscribe Monthly – <strong>$7.99</strong>
        </button>

        {/* Yearly Plan */}
        <button
          onClick={() => subscribe("yearly")}
          className="bg-green-600 text-white p-4 rounded-lg shadow"
        >
          Subscribe Yearly – <strong>$49.99</strong>
        </button>

        {/* Back Button */}
        <Link
          href="/"
          className="mt-8 text-center underline text-gray-600"
        >
          ← Back to Home
        </Link>
      </div>
    </main>
  );
}