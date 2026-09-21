import type { MetadataRoute } from "next";
import { absoluteUrl, CRAWLER_DISALLOWED_PATHS } from "@/lib/seo";

export const dynamic = "force-static";

/*
 * Le crawl reste largement ouvert : seules les routes de recette internes sont refusées. Les
 * espaces personnels restent crawlables pour que leur `noindex` soit effectivement lu — cf.
 * `CRAWLER_DISALLOWED_PATHS`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...CRAWLER_DISALLOWED_PATHS] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
