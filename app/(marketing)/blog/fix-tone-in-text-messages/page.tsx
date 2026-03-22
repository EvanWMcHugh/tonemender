import type { Metadata } from "next";
import Link from "next/link";

const articleTitle = "How to Fix Tone in Text Messages (Without Sounding Fake)";
const title = `${articleTitle} | ToneMender`;
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
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: articleTitle,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

export default function FixTonePost() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-900">
      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-1 text-sm text-slate-600 transition hover:text-slate-800 hover:underline"
      >
        <span aria-hidden>←</span>
        <span>Back to blog</span>
      </Link>

      <article>
        <header className="mb-10">
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight">
            {articleTitle}
          </h1>
          <p className="text-lg leading-relaxed text-slate-600">{description}</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Why tone gets lost in texts</h2>
          <p className="leading-relaxed text-slate-600">
            Unlike face-to-face conversations, text messages do not include facial
            expressions or vocal tone. Short or direct messages can easily come
            across as annoyed, impatient, or harsh, even when you are simply trying
            to be efficient.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Common tone mistakes and quick fixes</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-600">
            <li>
              <strong>Too short:</strong> Add one clarifying sentence, such as
              “Not upset — just moving fast.”
            </li>
            <li>
              <strong>Too direct:</strong> Add a softener, such as “Could you…” or
              “When you get a chance…”
            </li>
            <li>
              <strong>Ambiguous:</strong> Add intent, such as “I’m asking because I
              want to understand.”
            </li>
          </ul>
        </section>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-2 text-xl font-semibold">
            Want help rewriting a message before you send it?
          </h3>
          <p className="mb-4 text-slate-600">
            ToneMender rewrites your message into <strong>SOFT</strong>,{" "}
            <strong>CALM</strong>, and <strong>CLEAR</strong> options so you can
            pick what feels right without sounding fake.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Try ToneMender Free
          </Link>
        </div>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-bold">Examples of bad vs improved tone</h2>
          <p className="leading-relaxed text-slate-600">
            Small wording changes can dramatically change how a message feels
            without changing what you are actually trying to say. Adding context,
            softening phrasing, or clarifying intent often makes all the difference.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">How a message rewriter helps</h2>
          <p className="leading-relaxed text-slate-600">
            A relationship message rewriter like ToneMender helps adjust tone so
            your message sounds calm, clear, and respectful before you send it,
            reducing misunderstandings and unnecessary conflict.
          </p>
        </section>

        <div className="mt-14 text-center">
          <Link
            href="/sign-up"
            className="inline-block rounded-2xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white transition hover:bg-blue-500"
          >
            Try ToneMender Free
          </Link>
        </div>
      </article>
    </main>
  );
}