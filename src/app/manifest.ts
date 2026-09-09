import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.nomApplication,
    // Volontairement court : c'est le nom affiché SOUS l'icône, tronqué autour de
    // 12 caractères par iOS comme par Android.
    short_name: BRAND.nomCourtPwa,
    description: BRAND.description,
    // L'application démarre sur le tableau de bord, jamais sur la racine : la racine
    // redirige, et une redirection au lancement d'une application installée produit un
    // écran blanc perceptible.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0d1b2a",
    theme_color: "#0d1b2a",
    lang: "fr",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    /**
     * Raccourcis d'écran d'accueil (appui long sur l'icône).
     *
     * Les trois retenus sont les gestes que l'on fait DEBOUT, souvent une main occupée,
     * et plusieurs fois par jour : pointer son arrivée, photographier un ticket, retrouver
     * un chantier. Ce sont aussi les trois qui ouvriront hors ligne.
     *
     * Volontairement limité à trois : Android n'en affiche que quatre au mieux, et une
     * liste trop longue transforme un raccourci en menu — donc en temps perdu.
     */
    shortcuts: [
      {
        name: "Pointer mon arrivée ou mon départ",
        short_name: "Pointage",
        url: "/pointage",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Saisir une note de frais",
        short_name: "Note de frais",
        url: "/notes-frais",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Voir mes chantiers",
        short_name: "Chantiers",
        url: "/chantiers",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
