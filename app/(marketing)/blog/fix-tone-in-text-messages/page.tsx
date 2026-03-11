import type { Metadata } from "next";
import Link from "next/link";

const title = "How to Fix Tone in Text Messages (Without Sounding Fake) | ToneMender";
const description =
  "Learn how to fix tone in text messages so your words come across calm, clear, and respectful instead of harsh or cold.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/blog/fix-tone-in-text-messages",
  },
  openGraph: {
    title,
    description,
    url: "/blog/fix-tone-in-text-messages",
    siteName: "ToneMender",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function FixTonePost() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-slate-900">
      <Link
        href="/(marketing)/blog"
        className="inline-flex items-center gap-1 mb-8 text-sm text-slate-600 hover:text-slate-800 hover:underline transition"
      >
        <span aria-hidden>←</span>
        <span>Back to blog</span>
      </Link>

      <header className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight mb-6">{title.replace(" | ToneMender", "")}</h1>
        <p className="text-lg text-slate-600 leading-relaxed">{description}</p>
      </header>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold">Why tone gets lost in texts</h2>
        <p className="text-slate-600 leading-relaxed">
          Unlike face-to-face conversations, text messages don’t include facial expressions or vocal tone. Short or direct
          messages can easily come across as annoyed, impatient, or harsh — even when you’re just being efficient.
        </p>
      </section>

      <section className="space-y-6 mt-10">
        <h2 className="text-2xl font-bold">Common tone mistakes (and quick fixes)</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600">
          <li>
            <strong>Too short:</strong> Add one clarifying sentence (ex: “Not upset — just moving fast.”)
          </li>
          <li>
            <strong>Too direct:</strong> Add a softener (ex: “Could you…” / “When you get a chance…”)
          </li>
          <li>
            <strong>Ambiguous:</strong> Add intent (ex: “I’m asking because I want to understand.”)
          </li>
        </ul>
      </section>

      <div className="mt-12 border rounded-2xl p-6 bg-white shadow-sm">
        <h3 className="text-xl font-semibold mb-2">Want help rewriting a message before you send it?</h3>
        <p className="text-slate-600 mb-4">
          ToneMender rewrites your message into <strong>SOFT</strong>, <strong>CALM</strong>, and <strong>CLEAR</strong>{" "}
          options so you can pick what feels right — without sounding fake.
        </p>
        <Link
          href="/rewrite"
          className="inline-flex items-center justify-center px-5 py-3 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-500 transition"
        >
          Rewrite a message
        </Link>
      </div>

      <section className="space-y-6 mt-12">
        <h2 className="text-2xl font-bold">Examples of bad vs improved tone</h2>
        <p className="text-slate-600 leading-relaxed">
          Small wording changes can dramatically change how a message feels without changing what you’re actually trying
          to say. Adding context, softening phrasing, or clarifying intent often makes all the difference.
        </p>
      </section>

      <section className="space-y-6 mt-10">
        <h2 className="text-2xl font-bold">How a message rewriter helps</h2>
        <p className="text-slate-600 leading-relaxed">
          A relationship message rewriter like ToneMender helps adjust tone so your message sounds calm, clear, and
          respectful before you send it — reducing misunderstandings and unnecessary conflict.
        </p>
      </section>

      <div className="mt-14 text-center">
        <Link
          href="/(auth)/sign-up"
          className="inline-block px-8 py-4 bg-blue-600 text-white rounded-2xl text-lg font-semibold hover:bg-blue-500 transition"
        >
          Try ToneMender Free
        </Link>
      </div>
    </main>
  );
}