import type { MetadataRoute } from "next";
import { activeTools } from "@/lib/catalog";
import { getPublicUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicUrl();
  return [{ url: base, changeFrequency: "weekly", priority: 1 }, ...activeTools.map((tool) => ({ url: `${base}/outils/${tool.slug}`, changeFrequency: "monthly" as const, priority: 0.8 }))];
}
