"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import LogoutButton from "./components/LogoutButton";
import Link from "next/link";

export default function LandingPage() {
  const [authReady, setAuthReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setLoggedIn(!!user);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_pro")
          .eq("id", user.id)
          .single();

        setIsPro(profile?.is_pro || false);
      }

      setAuthReady(true);
    }

    load();
  }, []);

  if (!authReady) return null;

  return (
    <main className="w-full max-w-xl">
      <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 sm:p-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold">
              T
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                ToneMender
              </h1>
              <p className="text-xs text-slate-500">
                Say it better. Save it together.
              </p>
            </div>
          </div>

          {loggedIn && <LogoutButton />}
        </div>

        <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
          ToneMender transforms emotionally charged texts into calm, clear,
          relationship-safe messages — so you can say what you mean without
          starting a fight.
        </p>

        <p className="mt-3 text-xs sm:text-sm text-slate-500 leading-relaxed">
          Paste the text you're worried about sending. Choose how you want to
          sound, and ToneMender rewrites it into a version that's honest, safe,
          and easier to receive.
        </p>

        {/* Logged out */}
        {!loggedIn && (
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-slate-800 transition"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 text-slate-900 px-4 py-2.5 text-sm font-medium bg-white hover:bg-slate-50 transition"
            >
              Sign Up Free
            </Link>
          </div>
        )}

        {/* Logged in */}
        {loggedIn && (
          <>
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
                  Unlock unlimited rewrites, tone control, and relationship-specific guidance.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}