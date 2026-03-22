import type { MetadataRoute } from "next";

const BASE_URL = "https://tonemender.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: [
          "/api/",
          "/rewrite",
          "/drafts",
          "/account",
          "/upgrade",
          "/sign-in",
          "/sign-up",
          "/check-email",
          "/reset-password",
          "/confirm",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}