import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/server-auth";
import LandingEmailForm from "./LandingEmailForm";

export default async function MarketingLandingPage() {
  const user = await getCurrentUser();

  if (user?.id) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/landing" className="text-lg font-bold tracking-tight">
            ToneMender
          </Link>

          <nav className="hidden items-center gap-6 sm:flex">
            <Link
              href="/blog"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Blog
            </Link>
            <Link
              href="/relationship-message-rewriter"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              How it works
            </Link>
            <Link
              href="/sign-in"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Start Free
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div className="fade-scale-in">
            <div className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-wide text-blue-700">
              AI text rewrites for difficult conversations
            </div>

            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Rewrite texts so they sound
              <span className="text-blue-600"> calm, clear, and less likely to start a fight.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              ToneMender helps you take reactive, emotional, or harsh messages and turn
              them into softer, clearer communication before you hit send.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/sign-up"
                className="rounded-2xl bg-blue-600 px-8 py-4 text-center text-lg font-semibold text-white shadow-md transition hover:bg-blue-500"
              >
                Start Free
              </Link>

              <Link
                href="/sign-in"
                className="rounded-2xl border border-slate-300 bg-white px-8 py-4 text-center text-lg font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Sign In
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <span>No complicated setup</span>
              <span>Fast rewrites in seconds</span>
              <span>Built for emotional conversations</span>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4 text-sm">
              <Link
                href="/blog"
                className="font-medium text-blue-600 underline underline-offset-4"
              >
                Read the blog
              </Link>
              <Link
                href="/relationship-message-rewriter"
                className="font-medium text-slate-700 underline underline-offset-4"
              >
                Learn how it works
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Original message
              </p>
              <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                I am honestly getting tired of this. You always do this and then act
                like I am the problem.
              </div>

              <div className="my-5 h-px bg-slate-200" />

              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Rewritten message
              </p>
              <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-slate-700">
                I am feeling frustrated, and I want to talk about this in a better way.
                I do not want us to keep falling into the same pattern. Can we talk this
                through calmly?
              </div>

              <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                <span>Softens tone</span>
                <span>Clarifies intent</span>
                <span>Reduces conflict</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Why people use ToneMender
            </h2>
            <p className="mt-4 text-slate-600">
              When emotions are high, even a true message can come out wrong. ToneMender
              helps you say what you mean without sounding harsher than you intended.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <FeatureCard
              title="Calm the tone"
              body="Turn reactive wording into messages that sound more grounded and respectful."
            />
            <FeatureCard
              title="Reduce misunderstandings"
              body="Keep your point, but make it easier for the other person to hear."
            />
            <FeatureCard
              title="Rewrite in seconds"
              body="Paste the message, choose a tone, and get a cleaner version instantly."
            />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-bold">How it works</h2>
              <div className="mt-6 space-y-6">
                <Step
                  number="1"
                  title="Paste your message"
                  body="Start with the text you were about to send."
                />
                <Step
                  number="2"
                  title="Choose your tone"
                  body="Pick the style you want, like softer, calmer, or clearer."
                />
                <Step
                  number="3"
                  title="Send a better version"
                  body="Use the rewrite as-is or edit it before sending."
                />
              </div>

              <div className="mt-8">
                <Link
                  href="/relationship-message-rewriter"
                  className="font-medium text-blue-600 underline underline-offset-4"
                >
                  Explore the full rewrite experience
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-sm">
              <h2 className="text-2xl font-bold">Who it is for</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <AudienceCard text="Relationship conversations" />
                <AudienceCard text="Arguments in progress" />
                <AudienceCard text="Emotionally charged texts" />
                <AudienceCard text="Messages you want to soften" />
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm leading-7 text-slate-600">
                  ToneMender is especially useful when you know what you want to say,
                  but you do not want your wording to make things worse.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-blue-600 py-20 text-white">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Stop sending texts you regret.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-blue-100 sm:text-lg">
            Rewrite your message before it becomes a bigger problem.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="rounded-2xl bg-white px-8 py-4 text-lg font-semibold text-blue-700 shadow-md transition hover:bg-blue-50"
            >
              Start Free
            </Link>
            <Link
              href="/blog"
              className="rounded-2xl border border-blue-300 px-8 py-4 text-lg font-semibold text-white transition hover:bg-blue-500"
            >
              Read the Blog
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="text-3xl font-bold">Stay in the loop</h2>
          <p className="mt-2 text-sm text-slate-600">
            Join the list for product updates, new features, and early access.
          </p>

          <LandingEmailForm />

          <p className="mt-3 text-xs text-slate-500">
            We’ll email you a confirmation link. No spam.
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© ToneMender</p>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/blog" className="hover:text-slate-900">
              Blog
            </Link>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/sign-in" className="hover:text-slate-900">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
    </div>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
        {number}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-7 text-slate-600">{body}</p>
      </div>
    </div>
  );
}

function AudienceCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 shadow-sm">
      {text}
    </div>
  );
}