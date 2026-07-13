import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Liria Gestion Pro",
    short_name: "Liria Pro",
    description: "Gestion des chantiers, équipes, devis, factures, stock et matériel pour les entreprises du BTP.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0d1b2a",
    theme_color: "#0d1b2a",
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/liria-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/liria-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/liria-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
