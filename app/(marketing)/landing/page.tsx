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
      <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 text-center">
        <div className="fade-scale-in">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
            Rewrite texts to sound
            <span className="text-blue-600"> calm, clear, and relationship-safe.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-lg text-slate-600 sm:text-xl">
            ToneMender rewrites emotionally charged messages into softer, clearer
            communication — so important conversations do not turn into arguments.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="rounded-2xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-blue-500"
            >
              Start Free
            </Link>

            <Link
              href="/sign-in"
              className="rounded-2xl bg-slate-200 px-8 py-4 text-lg font-semibold text-slate-900 transition hover:bg-slate-300"
            >
              Sign In
            </Link>
          </div>

          <p className="mt-8 text-sm text-slate-500">
            Built for difficult texts, emotional conversations, and relationship peace.
          </p>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-4 text-center text-3xl font-bold">How it works</h2>
          <p className="mb-12 text-center text-slate-600">
            Write your message, choose the tone, and get a cleaner version in seconds.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Original message
              </p>
              <div className="rounded-2xl bg-slate-50 p-4 text-left text-sm leading-relaxed text-slate-700">
                I am honestly getting tired of this. You always do this and then act
                like I am the problem.
              </div>
            </div>

            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Rewritten message
              </p>
              <div className="rounded-2xl bg-white p-4 text-left text-sm leading-relaxed text-slate-700">
                I am feeling frustrated, and I want to talk about this in a better way.
                I do not want us to keep falling into the same pattern. Can we talk this
                through calmly?
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <FeatureCard
              title="Calm the tone"
              body="Turn reactive, heated messages into grounded communication."
            />
            <FeatureCard
              title="Reduce conflict"
              body="Say what you mean without sounding harsh or starting a fight."
            />
            <FeatureCard
              title="Rewrite in seconds"
              body="Generate soft, calm, or clear versions instantly."
            />
          </div>

          <p className="mt-10 text-center text-slate-600">
            Learn more about how a{" "}
            <Link
              href="/relationship-message-rewriter"
              className="font-medium text-blue-600 underline"
            >
              relationship message rewriter
            </Link>{" "}
            can prevent misunderstandings.
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="text-3xl font-bold">Stay in the loop</h2>
          <p className="mt-2 text-sm text-slate-600">
            Join the list for new features, early access, and product updates.
          </p>

          <LandingEmailForm />

          <p className="mt-3 text-xs text-slate-500">
            We’ll email you a confirmation link. No spam.
          </p>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm text-slate-600">{body}</p>
    </div>
  );
}