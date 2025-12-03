"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [stats, setStats] = useState({ today: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // GET USER
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/sign-in");
        return;
      }

      setEmail(data.user.email);

      // GET PROFILE (is_pro, plan type, stripe customer id)
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_pro, plan_type")
        .eq("id", data.user.id)
        .single();

      if (profile?.is_pro) setIsPro(true);

      // GET REWRITE STATS
      const todayStr = new Date().toISOString().split("T")[0];

      const { data: messages } = await supabase
        .from("rewrite_usage")
        .select("*")
        .eq("user_id", data.user.id);

      const today = messages?.filter((m) =>
        m.created_at.startsWith(todayStr)
      ).length || 0;

      const total = messages?.length || 0;

      setStats({ today, total });
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function openBillingPortal() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const res = await fetch("/api/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const json = await res.json();

    if (json.url) {
      window.location.href = json.url;
    } else {
      alert("Could not open billing portal.");
    }
  }

  if (loading) return <p className="p-5">Loading account...</p>;

  return (
    <main className="max-w-xl mx-auto p-6">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-blue-600 underline"
      >
        ← Back to Home
      </button>

      <h1 className="text-3xl font-bold mb-6">Your Account</h1>

      <div className="border p-4 rounded mb-6 bg-white">
        <h2 className="text-xl font-semibold mb-2">Profile</h2>

        <p className="text-gray-700 mb-2">
          <strong>Email:</strong> {email}
        </p>

        <p className="text-gray-700 mb-2">
          <strong>Status:</strong>{" "}
          {isPro ? "🚀 Pro Member" : "Free User"}
        </p>

        {isPro && (
          <button
            onClick={openBillingPortal}
            className="mt-3 bg-purple-600 text-white px-4 py-2 rounded"
          >
            Manage Subscription
          </button>
        )}
      </div>

      <div className="border p-4 rounded mb-6 bg-white">
        <h2 className="text-xl font-semibold mb-2">Usage</h2>

        <p><strong>Rewrites Today:</strong> {stats.today}</p>
        <p><strong>Total Rewrites:</strong> {stats.total}</p>
      </div>

      <div className="border p-4 rounded bg-white">
        <h2 className="text-xl font-semibold mb-2 text-red-600">
          Danger Zone
        </h2>

        <button
          onClick={handleLogout}
          className="bg-gray-800 text-white px-4 py-2 rounded mr-3"
        >
          Logout
        </button>
      </div>
    </main>
  );
}
