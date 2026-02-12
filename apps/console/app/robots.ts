import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3010";

  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: `${baseURL}/sitemap.xml`
  };
}
