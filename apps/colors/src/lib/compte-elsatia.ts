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

export const URL_COMPTE_PAR_DEFAUT = "http://localhost:3000/abonnement";

export function urlCompteElsatia(): string {
  return process.env.NEXT_PUBLIC_ELSATIA_ACCOUNT_URL ?? URL_COMPTE_PAR_DEFAUT;
}
