import Link from "next/link";
import Script from "next/script";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Relationship Message Rewriter – Fix Text Tone With AI | ToneMender",
  description:
    "ToneMender is an AI relationship message rewriter that fixes tone in text messages so conversations stay calm, clear, and respectful.",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is a relationship message rewriter?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "A relationship message rewriter uses AI to adjust tone in text messages so they sound calm, clear, and respectful instead of harsh or misunderstood.",
      },
    },
    {
      "@type": "Question",
      name: "Can this help prevent arguments over text?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "Yes. By softening wording and clarifying intent, a message rewriter helps prevent misunderstandings that often lead to unnecessary arguments.",
      },
    },
    {
      "@type": "Question",
      name: "Is ToneMender free to use?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "ToneMender offers free usage with optional paid features for higher limits and advanced tools.",
      },
    },
  ],
};

export default function RelationshipMessageRewriterPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-slate-900">
      <Script
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <Link
        href="/landing"
        className="inline-flex items-center gap-1 mb-8 text-sm text-slate-600 hover:underline"
      >
        <span aria-hidden>←</span>
        <span>Back to home</span>
      </Link>

      <header className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">
          Relationship Message Rewriter
        </h1>
        <p className="text-lg text-slate-600">
          ToneMender is an AI-powered relationship message rewriter that helps
          you fix tone in text messages before you send them — so conversations
          don’t turn into arguments.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center px-7 py-3 bg-blue-600 text-white rounded-2xl text-base font-semibold hover:bg-blue-500 transition"
          >
            Try ToneMender Free
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center px-7 py-3 bg-slate-200 text-slate-900 rounded-2xl text-base font-semibold hover:bg-slate-300 transition"
          >
            Sign In
          </Link>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          No credit card required to start.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Why tone matters in text messages</h2>
        <p className="text-slate-600">
          Text messages lack facial expressions and vocal tone, which can make
          even neutral messages sound cold, angry, or dismissive. Small wording
          issues can escalate into unnecessary conflict.
        </p>
        <p className="text-slate-600">
          A relationship message rewriter helps translate your intent into calm,
          clear language — without changing what you mean.
        </p>
      </section>

      <section className="mt-12">
        <div className="rounded-2xl border bg-slate-50 p-6">
          <h2 className="text-2xl font-bold mb-4">How ToneMender works</h2>
          <ol className="list-decimal list-inside text-slate-700 space-y-2">
            <li>Paste your text message</li>
            <li>Choose the tone you want (soft, calm, or clear)</li>
            <li>
              Get rewritten options that are emotionally safe and easy to send
            </li>
          </ol>
        </div>
      </section>

      <section className="space-y-4 mt-12">
        <h2 className="text-2xl font-bold">Who this is for</h2>
        <ul className="grid sm:grid-cols-3 gap-4">
          <li className="rounded-2xl border p-4">
            <p className="font-semibold">Couples</p>
            <p className="text-sm text-slate-600 mt-1">
              Reduce miscommunication and de-escalate tense moments.
            </p>
          </li>
          <li className="rounded-2xl border p-4">
            <p className="font-semibold">Overthinkers</p>
            <p className="text-sm text-slate-600 mt-1">
              Send messages confidently without rewriting them 10 times.
            </p>
          </li>
          <li className="rounded-2xl border p-4">
            <p className="font-semibold">Anyone</p>
            <p className="text-sm text-slate-600 mt-1">
              Say hard things with a calm tone — without starting a fight.
            </p>
          </li>
        </ul>
      </section>

      <section className="space-y-4 mt-12">
        <h2 className="text-2xl font-bold">FAQ</h2>

        <details className="rounded-2xl border p-4">
          <summary className="font-semibold cursor-pointer">
            What is a relationship message rewriter?
          </summary>
          <p className="text-sm text-slate-600 mt-2">
            It’s a tool that uses AI to adjust tone so your message sounds calm,
            clear, and respectful — instead of harsh, defensive, or easy to
            misread.
          </p>
        </details>

        <details className="rounded-2xl border p-4">
          <summary className="font-semibold cursor-pointer">
            Can this help prevent arguments over text?
          </summary>
          <p className="text-sm text-slate-600 mt-2">
            Yes. By softening phrasing and clarifying intent, it helps reduce
            misunderstandings that often lead to unnecessary conflict.
          </p>
        </details>

        <details className="rounded-2xl border p-4">
          <summary className="font-semibold cursor-pointer">
            Is ToneMender free to use?
          </summary>
          <p className="text-sm text-slate-600 mt-2">
            Yes. There’s free usage, with optional paid features for higher
            limits and additional tools.
          </p>
        </details>
      </section>

      <div className="mt-16 text-center">
        <Link
          href="/sign-up"
          className="inline-flex items-center justify-center px-8 py-4 bg-blue-600 text-white rounded-2xl text-lg font-semibold hover:bg-blue-500 transition"
        >
          Try ToneMender Free
        </Link>
        <p className="mt-3 text-xs text-slate-500">
          Start in under a minute.
        </p>
      </div>
    </main>
  );
}