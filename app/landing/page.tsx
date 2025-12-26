"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";

export default function MarketingLandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // 🔥 If user is logged in → redirect to main dashboard "/"
  useEffect(() => {
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      router.replace("/"); // redirect logged-in users immediately
    }
  });

  async function check() {
   const { data: sessionData } = await supabase.auth.getSession();
if (sessionData?.session?.user) {
  router.replace("/"); // redirect if already logged in
  return;
}
    setChecking(false); // show marketing page if NOT logged in
  }
  check();
return () => listener.subscription.unsubscribe();
}, [router]);

if (checking) return null; // prevent flicker

  // --------------------------------------------------------
  // ❤️ Logged-out Marketing Landing Page
  // --------------------------------------------------------
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* HERO SECTION */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-24 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-5xl sm:text-6xl font-extrabold tracking-tight"
        >
          An AI relationship message rewriter
<span className="text-blue-600"> that fixes text tone.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mt-6 text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto"
        >
          ToneMender rewrites emotionally charged text messages into calm, clear,
  relationship-safe communication — so conversations don’t turn into arguments.
        </motion.p>

        {/* CTA BUTTONS */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link
            href="/sign-up"
            className="px-8 py-4 bg-blue-600 text-white rounded-2xl text-lg font-semibold hover:bg-blue-500 transition shadow-md"
          >
            Start Free
          </Link>

          <Link
            href="/sign-in"
            className="px-8 py-4 bg-slate-200 text-slate-900 rounded-2xl text-lg font-semibold hover:bg-slate-300 transition"
          >
            Sign In
          </Link>
        </motion.div>

        <p className="mt-8 text-sm text-slate-500">
          Already helping people avoid fights daily.
        </p>
      </section>

      {/* FEATURES SECTION */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-10 text-center">
            What ToneMender helps you do
          </h2>
<p className="text-slate-600 text-center mb-12">
  Learn more about how a{" "}
  <Link
    href="/relationship-message-rewriter"
    className="text-blue-600 underline font-medium"
  >
    relationship message rewriter
  </Link>{" "}
  helps prevent misunderstandings.
</p>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="p-6 bg-white rounded-2xl shadow-sm border">
              <h3 className="text-lg font-semibold mb-2">🧘 Calm the tone</h3>
              <p className="text-slate-600 text-sm">
                Turn reactive, heated messages into steady, grounded communication.
              </p>
            </div>

            <div className="p-6 bg-white rounded-2xl shadow-sm border">
              <h3 className="text-lg font-semibold mb-2">❤️ Reduce conflict</h3>
              <p className="text-slate-600 text-sm">
                Say what you mean *without* starting a fight or sounding harsh.
              </p>
            </div>

            <div className="p-6 bg-white rounded-2xl shadow-sm border">
              <h3 className="text-lg font-semibold mb-2">✨ Rewrite in seconds</h3>
              <p className="text-slate-600 text-sm">
                Instantly transform messages into soft, calm, or clear variations.
              </p>
            </div>
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
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-10">What users say</h2>

          <div className="grid sm:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-2xl shadow border">
              <p className="text-slate-700 text-sm">
                “I avoided a fight with my boyfriend because of this app. Legit insane.”
              </p>
              <p className="mt-4 text-xs text-slate-500">— Sarah</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow border">
              <p className="text-slate-700 text-sm">
                “It made my text sound like a grown-up wrote it.”
              </p>
              <p className="mt-4 text-xs text-slate-500">— Brandon</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow border">
              <p className="text-slate-700 text-sm">
                “Honestly should be built into iMessage.”
              </p>
              <p className="mt-4 text-xs text-slate-500">— Mia</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 text-center text-slate-500 text-sm">
        <p>© {new Date().getFullYear()} ToneMender — Say it better. Save it together.</p>
        <Link href="/blog" className="underline block mb-2">
  Read the Blog
</Link>
        <Link href="/sign-in" className="mt-2 underline block">
          Go to App
        </Link>
      </footer>
    </main>
  );
}

/* ======================================================
   ✅ ONLY LOGIC CHANGE IS INSIDE THIS COMPONENT
====================================================== */

function EmailForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function joinWaitlist() {
  if (!email || loading) return;

  setLoading(true);

  try {
    await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    // ✅ Always show confirmation message
    setSubmitted(true);
    setEmail("");
  } catch (err) {
    console.warn("Newsletter request failed", err);
    // still show confirmation UX
    setSubmitted(true);
  } finally {
    setLoading(false);
  }
}

  return !submitted ? (
    <div className="mt-6 flex flex-col sm:flex-row gap-3">
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        className="border rounded-2xl px-4 py-3 text-sm w-full bg-slate-50 focus:bg-white focus:border-blue-500 transition"
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        onClick={joinWaitlist}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-semibold hover:bg-blue-500 disabled:opacity-60"
      >
        {loading ? "Joining..." : "Join"}
      </button>
    </div>
  ) : (
    <p className="text-green-600 font-semibold mt-4">
      ✔ Check your email to confirm — then you’re in!
    </p>
  );
}