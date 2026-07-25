import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — private HTML vault for AI agents`,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b12",
    theme_color: "#4f46e5",
    icons: [{ src: "/icon", sizes: "any", type: "image/svg+xml" }],
  };
}
