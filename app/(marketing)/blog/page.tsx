import type { Metadata } from "next";
import Link from "next/link";

const title = "ToneMender Blog – Text Tone & Relationship Communication";
const description =
  "Learn how to fix tone in text messages, avoid misunderstandings, and communicate clearly in relationships.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/blog" },
  openGraph: {
    title,
    description,
    url: "/blog",
    siteName: "ToneMender",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

const POSTS = [
  {
    href: "/blog/fix-tone-in-text-messages",
    title: "How to Fix Tone in Text Messages (Without Sounding Fake)",
    excerpt:
      "Learn why texts get misinterpreted — and how to rewrite them so they sound calm, clear, and emotionally safe.",
  },
] as const;

export default function BlogIndexPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-slate-900">
      <Link
        href="/landing"
        className="inline-flex items-center gap-1 mb-8 text-sm text-slate-600 hover:text-slate-800 hover:underline transition"
      >
        <span aria-hidden>←</span>
        <span>Back to home</span>
      </Link>

      <header className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight mb-6">ToneMender Blog</h1>
        <p className="text-lg text-slate-600">
          Tips, examples, and guides on fixing tone in text messages and improving communication in relationships.
        </p>
      </header>

      <div className="space-y-8">
        {POSTS.map((post) => (
          <article
            key={post.href}
            className="border rounded-2xl p-6 bg-white hover:border-blue-600 hover:shadow-sm transition"
          >
            <h2 className="text-2xl font-bold mb-2">
              <Link
                href={post.href}
                className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
              >
                {post.title}
              </Link>
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-4">{post.excerpt}</p>
            <Link href={post.href} className="text-sm font-semibold text-blue-700 hover:underline">
              Read more →
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}