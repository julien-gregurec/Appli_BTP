/**
 * Fermeture de l'indexation d'ELSATIA Colors.
 *
 * Colors est en phase précommerciale : l'application est en accès réservé et
 * aucune de ses routes n'a vocation à figurer dans un index public. Tant que la
 * commercialisation n'est pas ouverte, la consigne est la même partout —
 * `noindex, nofollow` — et elle est portée par trois mécanismes convergents,
 * jamais contradictoires :
 *
 *  - la balise `<meta name="robots">` du gabarit racine, issue de
 *    `ROBOTS_PRECOMMERCIAL` ;
 *  - l'en-tête `X-Robots-Tag`, émis par `next.config.ts` sur `/:path*`, qui
 *    couvre aussi ce qu'aucune balise ne peut couvrir (routes d'API, exports
 *    CSV, fichiers servis tels quels) ;
 *  - `/robots.txt`, généré depuis `REGLES_ROBOTS_PRECOMMERCIAL`.
 *
 * Aucun sitemap n'est publié : il désignerait précisément les URL que l'on
 * demande de ne pas parcourir.
 *
 * Ces déclarations ne sont pas un contrôle d'accès — elles ne valent que pour
 * les robots qui les respectent. Le verrou réel reste l'authentification.
 */

import type { Metadata, MetadataRoute } from "next";

/** Valeur unique de la consigne, reprise telle quelle par l'en-tête HTTP. */
export const CONSIGNE_ROBOTS = "noindex, nofollow";

/**
 * Consigne du gabarit racine. `nocache` demande en plus aux moteurs de ne pas
 * conserver de copie ; `noimageindex` ferme l'indexation des images, que
 * `noindex` seul ne couvre pas pour Googlebot.
 */
export const ROBOTS_PRECOMMERCIAL: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};

/**
 * Contenu de `/robots.txt` : refus global, sans sitemap.
 */
export const REGLES_ROBOTS_PRECOMMERCIAL: MetadataRoute.Robots = {
  rules: { userAgent: "*", disallow: "/" },
};

/**
 * En-tête d'indexation, appliqué à toutes les réponses par `next.config.ts`.
 *
 * Il est déclaré à part des en-têtes de sécurité : ce n'est pas une politique
 * de sécurité, et il sera retiré à l'ouverture commerciale sans toucher à
 * `src/lib/security/en-tetes.ts`.
 */
export function headersIndexationColors(): { key: string; value: string }[] {
  return [{ key: "X-Robots-Tag", value: CONSIGNE_ROBOTS }];
}
