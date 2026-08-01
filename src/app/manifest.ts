import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.nomApplication,
    short_name: BRAND.nomCourtPwa,
    description: BRAND.description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0d1b2a",
    theme_color: "#0d1b2a",
    lang: "fr",
    categories: ["business", "productivity"],
  };
}
