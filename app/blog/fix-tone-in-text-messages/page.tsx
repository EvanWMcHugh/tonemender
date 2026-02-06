import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to Fix Tone in Text Messages (Without Sounding Fake) | ToneMender",
  description:
    "Learn how to fix tone in text messages so your words come across calm, clear, and respectful instead of harsh or cold.",
};

export default function FixTonePost() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-slate-900">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1 mb-8 text-sm text-slate-600 hover:text-slate-800 hover:underline transition"
      >
        <span aria-hidden>←</span>
        <span>Back to blog</span>
      </Link>

      <h1 className="text-4xl font-extrabold tracking-tight mb-6">
        How to Fix Tone in Text Messages (Without Sounding Fake)
      </h1>

      <p className="text-lg text-slate-600 mb-10 leading-relaxed">
        Text messages are one of the easiest ways to accidentally sound upset,
        cold, or dismissive — even when that’s not your intention.
      </p>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold">Why tone gets lost in texts</h2>
        <p className="text-slate-600 leading-relaxed">
          Unlike face-to-face conversations, text messages don’t include facial
          expressions or vocal tone. Short or direct messages can easily come
          across as annoyed, impatient, or harsh — even when you’re just being
          efficient.
        </p>
      </section>

      <section className="space-y-6 mt-10">
        <h2 className="text-2xl font-bold">Examples of bad vs improved tone</h2>
        <p className="text-slate-600 leading-relaxed">
          Small wording changes can dramatically change how a message feels
          without changing what you’re actually trying to say. Adding context,
          softening phrasing, or clarifying intent often makes all the difference.
        </p>
      </section>

      <section className="space-y-6 mt-10">
        <h2 className="text-2xl font-bold">How a message rewriter helps</h2>
        <p className="text-slate-600 leading-relaxed">
          A relationship message rewriter like ToneMender helps adjust tone so
          your message sounds calm, clear, and respectful before you send it —
          reducing misunderstandings and unnecessary conflict.
        </p>
      </section>

      <div className="mt-14 text-center">
        <Link
          href="/sign-up"
          className="inline-block px-8 py-4 bg-blue-600 text-white rounded-2xl text-lg font-semibold hover:bg-blue-500 transition"
        >
          Try ToneMender Free
        </Link>
      </div>
    </main>
  );
}