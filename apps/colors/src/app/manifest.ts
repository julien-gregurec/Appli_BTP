import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "elsatia-colors",
    name: "ELSATIA Colors",
    short_name: "Colors",
    description: "Gestion intelligente des stocks et des teintes de peinture",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f7f4f1",
    theme_color: "#44264d",
    lang: "fr",
    categories: ["business", "productivity", "utilities"],
    // Les SVG restent en tête : nets à toute taille là où ils sont compris.
    // Les PNG 192 et 512 sont exigés par Chrome pour proposer l'installation,
    // et iOS ne sait pas lire une icône SVG du tout. Repli, pas remplacement.
    icons: [
      { src: "/icons/colors-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/colors-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/colors-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/colors-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/icons/colors-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
