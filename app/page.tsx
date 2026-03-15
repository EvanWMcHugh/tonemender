"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import LogoutButton from "./components/LogoutButton";

type MeUser = {
  id: string;
  email: string;
  isPro?: boolean;
  planType?: string | null;
  isReviewer?: boolean;
  reviewerMode?: "free" | "pro" | null;
};

type MeResponse = {
  user: MeUser | null;
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AppHomePage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<MeUser | null>(null);

  const mountedRef = useRef(true);
  const brandInitial = useMemo(() => "T", []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function fetchMe() {
      const response = await fetch("/api/user/me", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      const json = (await response.json().catch(() => ({ user: null }))) as MeResponse;
      return json?.user ?? null;
    }

    async function load() {
      try {
        let nextUser: MeUser | null = null;

        for (let attempt = 0; attempt < 8; attempt++) {
          nextUser = await fetchMe();

          if (nextUser?.id) {
            break;
          }

          await sleep(250);
        }

        if (!nextUser?.id) {
          router.replace("/landing");
          return;
        }

        if (!mountedRef.current) return;

        setUser(nextUser);
        setAuthReady(true);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        router.replace("/landing");
      }
    }

    load();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [router]);

  if (!authReady || !user) return null;

  const isPro = Boolean(user.isPro);
  const reviewerLabel =
    user.reviewerMode === "pro"
      ? "Reviewer Mode · Pro"
      : user.reviewerMode === "free"
      ? "Reviewer Mode · Free"
      : null;

  return (
    <main className="w-full max-w-xl">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white"
              aria-hidden="true"
            >
              {brandInitial}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ToneMender</h1>
              <p className="text-xs text-slate-500">Say it better. Save it together.</p>
            </div>
          </div>

          <LogoutButton />
        </div>

        {reviewerLabel && (
          <div className="mb-4">
            <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {reviewerLabel}
            </div>
          </div>
        )}

        <p className="text-sm leading-relaxed text-slate-700 sm:text-base">
          Welcome back! Rewrite your messages into calm, clear, relationship-safe
          communication.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/rewrite"
            className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white shadow-sm transition hover:bg-blue-500"
          >
            Rewrite Message
          </Link>

          <Link
            href="/drafts"
            className="rounded-xl bg-slate-800 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Drafts
          </Link>

          <Link
            href="/account"
            className="rounded-xl bg-indigo-600 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Account
          </Link>
        </div>

        {!isPro && (
          <div className="mt-6">
            <Link
              href="/upgrade"
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400"
            >
              Upgrade to Pro
            </Link>
            <p className="mt-2 text-center text-xs text-slate-500">
              Unlock unlimited rewrites, tone control, and more.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}