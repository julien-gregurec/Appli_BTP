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
    icons: [
      { src: "/icons/colors-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/colors-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
