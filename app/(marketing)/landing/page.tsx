"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";

type LoadState = "checking" | "ready";

async function fetchMe(signal?: AbortSignal) {
  const resp = await fetch("/api/user/me", { method: "GET", cache: "no-store", signal });
  const json = await resp.json().catch(() => ({ user: null }));
  return json?.user ?? null;
}

export default function MarketingLandingPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>("checking");

  // ✅ If user is logged in (cookie session) → redirect to "/"
  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        let user = await fetchMe(controller.signal);

        // Retry once (helps immediately after login/logout)
        if (!user?.id) {
          await new Promise((r) => setTimeout(r, 200));
          user = await fetchMe(controller.signal);
        }

        if (user?.id) {
          router.replace("/");
          return;
        }

        setState("ready");
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("LANDING SESSION CHECK ERROR:", err);
        setState("ready");
      }
    }

    checkSession();
    return () => controller.abort();
  }, [router]);

  if (state === "checking") return null;

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* HERO */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-24 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="text-5xl sm:text-6xl font-extrabold tracking-tight"
        >
          An AI relationship message rewriter
          <span className="text-blue-600"> that fixes text tone.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.55 }}
          className="mt-6 text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto"
        >
          ToneMender rewrites emotionally charged messages into calm, clear,
          relationship-safe communication — so conversations don’t turn into
          arguments.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22, duration: 0.45 }}
          className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link
            href="/(auth)/sign-up"
            className="px-8 py-4 bg-blue-600 text-white rounded-2xl text-lg font-semibold hover:bg-blue-500 transition shadow-md"
          >
            Start Free
          </Link>

          <Link
            href="/(auth)/sign-in"
            className="px-8 py-4 bg-slate-200 text-slate-900 rounded-2xl text-lg font-semibold hover:bg-slate-300 transition"
          >
            Sign In
          </Link>
        </motion.div>

        <p className="mt-8 text-sm text-slate-500">
          Already helping people avoid fights daily.
        </p>
      </section>

      {/* FEATURES */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4 text-center">
            What ToneMender helps you do
          </h2>

          <p className="text-slate-600 text-center mb-12">
            Learn more about how a{" "}
            <Link
              href="/(marketing)/relationship-message-rewriter"
              className="text-blue-600 underline font-medium"
            >
              relationship message rewriter
            </Link>{" "}
            prevents misunderstandings.
          </p>

          <div className="grid sm:grid-cols-3 gap-8">
            <FeatureCard
              title="🧘 Calm the tone"
              body="Turn reactive, heated messages into steady, grounded communication."
            />
            <FeatureCard
              title="❤️ Reduce conflict"
              body="Say what you mean without starting a fight or sounding harsh."
            />
            <FeatureCard
              title="✨ Rewrite in seconds"
              body="Instantly transform messages into soft, calm, or clear variations."
            />
          </div>
        </div>
      </section>

      {/* EMAIL CAPTURE */}
      <section className="py-20">
        <div className="max-w-xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold">Stay in the loop</h2>
          <p className="text-slate-600 mt-2 text-sm">
            Join the list for new features, early access, and special updates.
          </p>

          <EmailForm />
          <p className="mt-3 text-xs text-slate-500">
            We’ll email you a confirmation link. No spam.
          </p>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-10">What users say</h2>

          <div className="grid sm:grid-cols-3 gap-8">
            <TestimonialCard
              quote="I avoided a fight with my boyfriend because of this app. Legit insane."
              name="Sarah"
            />
            <TestimonialCard
              quote="It made my text sound like a grown-up wrote it."
              name="Brandon"
            />
            <TestimonialCard
              quote="Honestly should be built into iMessage."
              name="Mia"
            />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 text-center text-slate-500 text-sm">
        <p>
          © {new Date().getFullYear()} ToneMender — Say it better. Save it
          together.
        </p>

        <div className="mt-3 flex items-center justify-center gap-4">
          <Link href="/(makreting)/blog" className="underline">
            Read the Blog
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/(auth)/sign-in" className="underline">
            Go to App
          </Link>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-6 bg-white rounded-2xl shadow-sm border">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-slate-600 text-sm">{body}</p>
    </div>
  );
}

function TestimonialCard({ quote, name }: { quote: string; name: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow border">
      <p className="text-slate-700 text-sm">“{quote}”</p>
      <p className="mt-4 text-xs text-slate-500">— {name}</p>
    </div>
  );
}

/* ======================================================
   Email capture form (client-side)
====================================================== */

function EmailForm() {
  const inputId = useId();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const validEmail = useMemo(() => {
    const v = email.trim();
    if (!v) return false;
    // light validation; server is source of truth
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }, [email]);

  async function joinWaitlist() {
    const trimmed = email.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setErr("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      // Always show confirmation UX (privacy-friendly; no email enumeration)
      setSubmitted(true);

      // Only clear on success so user can retry if they want
      if (res.ok) setEmail("");
    } catch (e) {
      console.warn("Newsletter request failed", e);
      setSubmitted(true);
      setErr("Something went wrong — try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validEmail || loading) return;
    joinWaitlist();
  }

  if (submitted) {
    return (
      <div className="mt-6">
        <p className="text-green-600 font-semibold">
          ✔ Check your email to confirm — then you’re in!
        </p>
        {err && <p className="text-xs text-slate-500 mt-2">{err}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>
        <input
          id={inputId}
          type="email"
          placeholder="Enter your email"
          value={email}
          className="border rounded-2xl px-4 py-3 text-sm w-full bg-slate-50 focus:bg-white focus:border-blue-500 transition"
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          aria-invalid={email.length > 0 && !validEmail}
        />
        <button
          type="submit"
          disabled={loading || !validEmail}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-semibold hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Joining..." : "Join"}
        </button>
      </div>

      {email.length > 0 && !validEmail && (
        <p className="text-xs text-slate-500 mt-2">
          Please enter a valid email address.
        </p>
      )}
    </form>
  );
}