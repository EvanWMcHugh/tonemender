import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://tonemender.com",
      lastModified: new Date(),
    },
    {
      url: "https://tonemender.com/landing",
      lastModified: new Date(),
    },
    {
      url: "https://tonemender.com/relationship-message-rewriter",
      lastModified: new Date(),
    },
    {
      url: "https://tonemender.com/privacy",
      lastModified: new Date(),
    },
    {
      url: "https://tonemender.com/terms",
      lastModified: new Date(),
    },
  ];
}