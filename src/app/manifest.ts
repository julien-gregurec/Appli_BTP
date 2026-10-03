import type { MetadataRoute } from "next";
import { ASSETS_MARQUE, MARQUE } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: MARQUE.nom,
    short_name: MARQUE.nomCourt,
    description: "Gestion des chantiers, équipes, devis, factures, stock et matériel pour les entreprises du BTP.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: MARQUE.couleurFond,
    theme_color: MARQUE.couleurFond,
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: ASSETS_MARQUE.icone192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ASSETS_MARQUE.icone512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ASSETS_MARQUE.iconeMaskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
