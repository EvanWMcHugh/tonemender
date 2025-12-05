import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ToneMender",
  description: "Say it better. Save it together.",
  openGraph: {
    title: "ToneMender — Rewrite Texts the Smart Way",
    description:
      "ToneMender transforms emotionally charged texts into healthy, relationship-safe communication.",
    url: "https://tone13.vercel.app",
    siteName: "ToneMender",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ToneMender — Before & After text preview",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ToneMender",
    description:
      "Rewrite your messages into calmer, clearer, relationship-safe texts.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <div className="min-h-screen flex items-start justify-center px-4 sm:px-0 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}