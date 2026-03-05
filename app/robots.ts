import type { MetadataRoute } from "next";

const BASE_URL = "https://tonemender.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/landing",
          "/blog",
          "/blog/",
          "/relationship-message-rewriter",
          "/privacy",
          "/terms",
        ],
        disallow: [
          "/rewrite",
          "/drafts",
          "/account",
          "/upgrade",
          "/sign-in",
          "/sign-up",
          "/check-email",
          "/reset-password",
          "/confirm",
          "/api",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}