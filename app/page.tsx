"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import LogoutButton from "./components/LogoutButton";
import { isProReviewer } from "../lib/reviewers";

type MeResponse =
  | { user: null }
  | {
      user: {
        id: string;
        email: string;
        isPro?: boolean;
        planType?: string | null;
      };
    };

export default function AppHomePage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const fetchMe = async () => {
          const resp = await fetch("/api/me", { method: "GET", cache: "no-store" });
          const json = (await resp.json().catch(() => ({ user: null }))) as MeResponse;
          return json?.user ?? null;
        };

        let user = await fetchMe();

        // Retry once (helps right after login/logout navigation)
        if (!user?.id) {
          await new Promise((r) => setTimeout(r, 200));
          user = await fetchMe();
        }

        if (!user?.id) {
          router.replace("/landing");
          return;
        }

        if (cancelled) return;

        // Reviewer emails always count as Pro
        const pro = Boolean(user.isPro) || isProReviewer(user.email ?? null);

        setIsPro(pro);
        setAuthReady(true);
      } catch (err) {
        console.error("HOME LOAD ERROR:", err);
        router.replace("/landing");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Prevent rendering until auth check completes
  if (!authReady) return null;

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
          Welcome back! Rewrite your messages into calm, clear, relationship-safe communication.
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