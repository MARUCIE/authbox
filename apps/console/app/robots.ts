import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3010";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/platforms",
        "/metrics",
        "/accounts",
        "/assistants",
        "/audit",
        "/credentials",
        "/settings",
        "/api"
      ]
    },
    sitemap: `${baseURL}/sitemap.xml`
  };
}
