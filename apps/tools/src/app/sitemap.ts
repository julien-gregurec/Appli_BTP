import type { MetadataRoute } from "next";
import { activeTools } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

/*
 * Le sitemap ne liste que des pages réellement indexables : l'accueil et les fiches outil du
 * catalogue actif. Toute page portant `noindex` (espaces personnels, Atelier, recettes internes)
 * en est exclue — annoncer une URL qu'on refuse d'indexer est une contradiction pour le robot.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    ...activeTools.map((tool) => ({ url: absoluteUrl(`/outils/${tool.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
