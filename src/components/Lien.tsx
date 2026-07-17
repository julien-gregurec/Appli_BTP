import NextLink, { type LinkProps } from "next/link";
import type { ComponentProps } from "react";

/**
 * Lien de navigation qui NE précharge PAS par défaut.
 *
 * `next/link` précharge la charge RSC de chaque lien visible. Ici, chaque page
 * coûte 2 à 4 s de rendu serveur (requêtes Supabase) : afficher une liste de
 * 20 chantiers déclenchait donc le rendu des 20 fiches en arrière-plan. Mesuré
 * en production : 19 pages préchargées pour rien sur /chantiers, soit 10 s de
 * travail serveur gaspillé, qui ralentissaient la page réellement demandée.
 *
 * À utiliser pour tout lien nombreux ou peu susceptible d'être suivi : lignes
 * de liste, grilles de modules, entrées de menu. Pour un lien unique et
 * quasi certain d'être cliqué, `prefetch` peut être repassé à true.
 */
export function Lien({
  prefetch = false,
  ...props
}: ComponentProps<typeof NextLink> & Pick<LinkProps, "prefetch">) {
  return <NextLink prefetch={prefetch} {...props} />;
}
