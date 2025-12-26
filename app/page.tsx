"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import LogoutButton from "./components/LogoutButton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isProReviewer } from "../lib/reviewers";

export default function AppHomePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
  async function load() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.replace("/landing"); // send non-logged-in users away
      return;
    }

      // Otherwise logged in
      setLoggedIn(true);

      // Fetch profile status
      const { data: profile } = await supabase
      .from("profiles")
      .select("is_pro")
      .eq("id", data.user.id)
      .single();

    setIsPro(profile?.is_pro || isProReviewer(data.user.email));
    setAuthReady(true);
  }

  load();
}, [router]);

// PREVENT rendering / redirect until auth state is checked
if (!authReady) return null;

  // 🟢 Logged-in dashboard HOME
  return (
    <main className="w-full max-w-xl">
      <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 sm:p-8">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold">
              T
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ToneMender</h1>
              <p className="text-xs text-slate-500">Say it better. Save it together.</p>
            </div>
          </div>

          <LogoutButton />
        </div>

        {/* DESCRIPTION */}
        <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
          Welcome back! Rewrite your messages into calm, clear, relationship-safe
          communication.
        </p>

        {/* NAVIGATION */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/rewrite"
            className="rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-medium text-center shadow-sm hover:bg-blue-500 transition"
          >
            Rewrite Message
          </Link>

          <Link
            href="/drafts"
            className="rounded-xl bg-slate-800 text-white px-4 py-3 text-sm font-medium text-center hover:bg-slate-700 transition"
          >
            Drafts
          </Link>

          <Link
            href="/account"
            className="rounded-xl bg-indigo-600 text-white px-4 py-3 text-sm font-medium text-center hover:bg-indigo-500 transition"
          >
            Account
          </Link>
        </div>

        {!isPro && (
          <div className="mt-6">
            <Link
              href="/upgrade"
              className="inline-flex items-center justify-center w-full rounded-xl bg-emerald-500 text-white px-4 py-3 text-sm font-semibold shadow-sm hover:bg-emerald-400 transition"
            >
              Upgrade to Pro
            </Link>
            <p className="mt-2 text-xs text-slate-500 text-center">
              Unlock unlimited rewrites, tone control, and more.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}