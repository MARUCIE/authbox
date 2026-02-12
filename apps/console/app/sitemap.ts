import type { MetadataRoute } from "next";
import { allPublicPaths } from "../lib/marketing";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3010";
  const now = new Date();

  return allPublicPaths().map((path) => ({
    url: `${baseURL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7
  }));
}
