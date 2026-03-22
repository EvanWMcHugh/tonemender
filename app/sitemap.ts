import type { MetadataRoute } from "next";

const BASE_URL = "https://tonemender.com";

const BLOG_POSTS = [
  "fix-tone-in-text-messages",
  // add future posts here
  // "stop-text-message-fights",
  // "how-to-sound-calm-in-text",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: "2026-03-21",
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/landing`,
      lastModified: "2026-03-21",
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/relationship-message-rewriter`,
      lastModified: "2026-03-21",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: "2026-03-21",
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: "2026-03-21",
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: "2026-03-21",
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const blogPages: MetadataRoute.Sitemap = BLOG_POSTS.map((slug) => ({
    url: `${BASE_URL}/blog/${slug}`,
    lastModified: "2026-03-21",
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...blogPages];
}