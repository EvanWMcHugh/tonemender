import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "ToneMender – AI Relationship Message Rewriter",
  description:
    "ToneMender is an AI relationship message rewriter that fixes tone in text messages before you send — helping prevent misunderstandings and arguments.",
  metadataBase: new URL("https://tonemender.com"),

  alternates: {
    canonical: "/",
  },

  openGraph: {
    title: "ToneMender – AI Relationship Message Rewriter",
    description:
      "Fix the tone of your texts before you send. Prevent misunderstandings and arguments with AI rewrites.",
    url: "https://tonemender.com",
    siteName: "ToneMender",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "ToneMender – AI Relationship Message Rewriter",
    description:
      "Fix the tone of your texts before you send. Prevent misunderstandings and arguments with AI rewrites.",
  },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ToneMender",
  description:
    "An AI relationship message rewriter that helps people fix tone in text messages and communicate clearly without starting conflict.",
  applicationCategory: "CommunicationApplication",
  operatingSystem: "Web, iOS, Android",
  url: "https://tonemender.com",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  creator: {
    "@type": "Organization",
    name: "ToneMender",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* ✅ Structured SEO Schema */}
        <script
          type="application/ld+json"
          // NOTE: JSON.stringify is safe here; do not inject user content.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>

      <body className="min-h-screen flex flex-col">
        {/* Cloudflare Turnstile (loaded once globally) */}
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />

        <Providers>
          <main className="flex-1">{children}</main>
        </Providers>

        {/* ✅ Global Footer */}
        <footer className="border-t py-6 text-sm text-gray-500">
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span>© {new Date().getFullYear()} ToneMender</span>

            <nav className="flex gap-4" aria-label="Footer navigation">
              <Link href="/(legal)/privacy" className="hover:text-gray-700">
                Privacy Policy
              </Link>
              <Link href="/(legal)/terms" className="hover:text-gray-700">
                Terms of Service
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}