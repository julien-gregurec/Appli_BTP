import type { MetadataRoute } from "next";

// Application privée/authentifiée : aucun crawl, aucun sitemap. Le
// référencement de la marque et des tarifs vit sur le site public
// elsatia.fr — voir la balise `robots` par défaut dans layout.tsx pour le
// niveau metadata (noindex sur chaque page rendue).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
