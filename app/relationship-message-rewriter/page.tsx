import Link from "next/link";

export const metadata = {
  title: "Relationship Message Rewriter – Fix Text Tone With AI | ToneMender",
  description:
    "ToneMender is an AI relationship message rewriter that fixes tone in text messages so conversations stay calm, clear, and respectful.",
};

export default function RelationshipMessageRewriterPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-slate-900">
      <h1 className="text-4xl font-extrabold tracking-tight mb-6">
        Relationship Message Rewriter
      </h1>

      <p className="text-lg text-slate-600 mb-10">
        ToneMender is an AI-powered relationship message rewriter that helps you
        fix tone in text messages before you send them — so conversations don’t
        turn into arguments.
      </p>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold">Why tone matters in text messages</h2>
        <p className="text-slate-600">
          Text messages lack facial expressions and vocal tone, which makes even
          neutral messages sound cold, angry, or dismissive. Small wording
          mistakes can escalate into unnecessary conflict.
        </p>

        <p className="text-slate-600">
          A relationship message rewriter helps translate your intent into calm,
          clear language — without changing what you actually mean.
        </p>
      </section>

      <section className="space-y-6 mt-12">
        <h2 className="text-2xl font-bold">How ToneMender works</h2>
        <ul className="list-disc list-inside text-slate-600 space-y-2">
          <li>Paste your text message</li>
          <li>Choose the tone you want (calm, clear, respectful)</li>
          <li>Instantly get a rewritten version that sounds emotionally safe</li>
        </ul>
      </section>

      <section className="space-y-6 mt-12">
        <h2 className="text-2xl font-bold">Who this is for</h2>
        <ul className="list-disc list-inside text-slate-600 space-y-2">
          <li>Couples trying to avoid miscommunication</li>
          <li>People who overthink texts</li>
          <li>Anyone who wants to say things without starting a fight</li>
        </ul>
      </section>

      <div className="mt-16 text-center">
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