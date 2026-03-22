import type { Metadata } from "next";
import Link from "next/link";

const title = "ToneMender Blog – Text Tone & Relationship Communication";
const description =
  "Learn how to fix tone in text messages, avoid misunderstandings, and communicate more clearly in relationships.";

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
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ToneMender Blog",
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

const POSTS = [
  {
    href: "/blog/fix-tone-in-text-messages",
    title: "How to Fix Tone in Text Messages (Without Sounding Fake)",
    excerpt:
      "Learn why texts get misinterpreted and how to rewrite them so they sound calm, clear, and emotionally safe.",
  },
] as const;

export default function BlogIndexPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 text-slate-900">
      <Link
        href="/landing"
        className="mb-8 inline-flex items-center gap-1 text-sm text-slate-600 transition hover:text-slate-800 hover:underline"
      >
        <span aria-hidden>←</span>
        <span>Back to home</span>
      </Link>

      <header className="mb-12">
        <h1 className="mb-6 text-4xl font-extrabold tracking-tight">
          ToneMender Blog
        </h1>
        <p className="text-lg text-slate-600">
          Tips, examples, and guides for fixing tone in text messages and improving
          communication in relationships.
        </p>
      </header>

      <div className="space-y-8">
        {POSTS.map((post) => (
          <article
            key={post.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-blue-600 hover:shadow-sm"
          >
            <h2 className="mb-2 text-2xl font-bold">
              <Link
                href={post.href}
                className="rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {post.title}
              </Link>
            </h2>

            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              {post.excerpt}
            </p>

            <Link
              href={post.href}
              className="text-sm font-semibold text-blue-700 hover:underline"
            >
              Read more →
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}