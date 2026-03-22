"use client";

import { useId, useState } from "react";

export default function LandingEmailForm() {
  const inputId = useId();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const trimmedEmail = email.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

  async function joinWaitlist() {
  if (!trimmedEmail || loading) return;

  setLoading(true);
  setErr("");

  try {
    const res = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setErr(data?.error || "Something went wrong — try again in a moment.");
      return;
    }

    setSubmitted(true);
    setEmail("");
  } catch (error: unknown) {
    console.warn("Newsletter request failed", error);
    setErr("Something went wrong — try again in a moment.");
  } finally {
    setLoading(false);
  }
}

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validEmail || loading) return;
    void joinWaitlist();
  }

  if (submitted) {
    return (
      <div className="mt-6">
        <p className="font-semibold text-green-600">
          ✔ Check your email to confirm — then you’re in!
        </p>
        {err && <p className="mt-2 text-xs text-slate-500">{err}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>

        <input
          id={inputId}
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          aria-invalid={email.length > 0 && !validEmail}
          className="w-full rounded-2xl border bg-slate-50 px-4 py-3 text-sm transition focus:border-blue-500 focus:bg-white"
        />

        <button
          type="submit"
          disabled={loading || !validEmail}
          className="rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Joining..." : "Get updates"}
        </button>
      </div>

      {email.length > 0 && !validEmail && (
        <p className="mt-2 text-xs text-slate-500">
          Please enter a valid email address.
        </p>
      )}
    </form>
  );
}