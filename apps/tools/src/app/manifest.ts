import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.productName} — Boîte à outils numérique du chantier`,
    short_name: SITE.shortName,
    description: "Outils, calculs et tracés BTP précis, utilisables hors connexion.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f3ef",
    theme_color: "#f5aa22",
    orientation: "any",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
