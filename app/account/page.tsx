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
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/sign-in");
        return;
      }

      setEmail(data.user.email);

      // Load profile data
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_pro")
        .eq("id", data.user.id)
        .single();

      if (profile?.is_pro) setIsPro(true);

      // Load usage stats
      const todayStr = new Date().toISOString().split("T")[0];

      const { data: usage } = await supabase
        .from("rewrite_usage")
        .select("*")
        .eq("user_id", data.user.id);

      const today = usage?.filter((u) =>
        u.created_at.startsWith(todayStr)
      ).length || 0;

      const total = usage?.length || 0;

      setStats({ today, total });
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function deleteAllMessages() {
    const ok = confirm("Delete ALL saved messages? This cannot be undone.");
    if (!ok) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    await supabase.from("messages").delete().eq("user_id", user.user.id);
    alert("All messages deleted.");
    location.reload();
  }

  async function deleteAccount() {
    const ok = confirm(
      "Delete your ENTIRE account? This action is permanent."
    );
    if (!ok) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    await supabase.auth.admin.deleteUser(user.user.id);
    alert("Your account has been deleted.");
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

      {/* PROFILE CARD */}
      <div className="border p-4 rounded mb-6 bg-white">
        <h2 className="text-xl font-semibold mb-2">Profile</h2>
        <p className="mb-2"><strong>Email:</strong> {email}</p>
        <p className="mb-2">
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

      {/* USAGE */}
      <div className="border p-4 rounded mb-6 bg-white">
        <h2 className="text-xl font-semibold mb-2">Usage</h2>
        <p><strong>Rewrites Today:</strong> {stats.today}</p>
        <p><strong>Total Rewrites:</strong> {stats.total}</p>
      </div>

      {/* SECURITY */}
      <div className="border p-4 rounded mb-6 bg-white">
        <h2 className="text-xl font-semibold mb-2">Security</h2>

        <button
          onClick={handleLogout}
          className="bg-gray-800 text-white px-4 py-2 rounded mr-3"
        >
          Logout
        </button>
      </div>

      {/* DANGER ZONE */}
      <div className="border p-4 rounded bg-white">
        <h2 className="text-xl font-semibold text-red-600 mb-3">
          Danger Zone
        </h2>

        <button
          onClick={deleteAllMessages}
          className="border border-red-500 text-red-600 px-4 py-2 rounded mr-3"
        >
          Delete All Messages
        </button>

        <button
          onClick={deleteAccount}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Delete Account
        </button>
      </div>
    </main>
  );
}
