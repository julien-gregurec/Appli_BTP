/**
 * Portail de compte et d'abonnement ELSATIA.
 *
 * Colors n'ouvre aucun compte : l'identité ELSATIA est créée et administrée sur
 * Gestion Pro, et Colors ne fait que la consommer. Toute sortie vers ce portail
 * passe donc par cette valeur unique, plutôt que par la même expression recopiée
 * dans chaque écran — quatre copies coexistaient, avec quatre occasions de
 * diverger.
 *
 * Le repli `http://localhost:3000/abonnement` est juste en développement et faux
 * partout ailleurs. Il n'est pas là pour dépanner un déploiement : la garde
 * `scripts/verify-public-env.mjs` refuse un build publié sans
 * `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`, précisément pour que ce repli ne soit
 * jamais servi à un utilisateur final.
 */

import { urlNavigationSure } from "@elsatia/application-access";
import { environnementApplications } from "@/lib/routes-applications";

export const URL_COMPTE_PAR_DEFAUT = "http://localhost:3000/abonnement";

/**
 * A-08 (satellites Preview readiness V2) : l'URL est validée pour l'environnement courant
 * (`ELSATIA_APPLICATION_ENV`). En Preview, une URL de Production (`app.elsatia.fr`) ou locale
 * est écartée ; en Production, seule une URL canonique `*.elsatia.fr` est servie ; un
 * environnement inconnu n'en sert aucune. `null` : le lien n'est pas affiché — jamais une
 * bascule silencieuse vers un autre environnement. Le repli localhost ne vaut qu'en local.
 */
export function urlCompteElsatia(): string | null {
  const environnement = environnementApplications();
  const declaree = process.env.NEXT_PUBLIC_ELSATIA_ACCOUNT_URL?.trim();
  const brute = declaree || (environnement === "local" ? URL_COMPTE_PAR_DEFAUT : null);
  return urlNavigationSure(brute, environnement);
}
