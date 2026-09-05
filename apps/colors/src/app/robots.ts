import type { MetadataRoute } from "next";

import { REGLES_ROBOTS_PRECOMMERCIAL } from "@/lib/seo/indexation";

/**
 * `/robots.txt` de Colors : refus global tant que l'application est en accès
 * réservé. Aucun sitemap n'y est déclaré — voir `src/lib/seo/indexation.ts`.
 */
export default function robots(): MetadataRoute.Robots {
  return REGLES_ROBOTS_PRECOMMERCIAL;
}
