import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only the two marketing routes: /p/ pages are secret-by-URL and must never be listed.
  return [
    { url: site.url, changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/docs`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
