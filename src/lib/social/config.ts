// Configuration ELSATIA Social, lue exclusivement côté serveur.
// Aucune de ces variables ne doit être préfixée NEXT_PUBLIC_.

// Versions d'API par défaut, surchargeables sans redéploiement de code.
// Meta : Graph API v26.0 (publiée le 29/07/2026), dernière version vérifiée.
// LinkedIn : version 202609, dernière version vérifiée ; LinkedIn
// maintient chaque version au moins un an, la mettre à jour au moins une fois par an.
export const META_GRAPH_VERSION_DEFAUT = "v26.0";
export const LINKEDIN_VERSION_DEFAUT = "202609";

/**
 * Mode simulation, règle par défaut. Aucune écriture (publication, réponse,
 * message) n'est envoyée aux plateformes, sauf si LES DEUX conditions sont réunies :
 *   1. déploiement Vercel de production (VERCEL_ENV=production) ;
 *   2. SOCIAL_DRY_RUN vaut exactement "false" (décision explicite de Julien).
 * En local, en prévisualisation ou au moindre doute : simulation.
 * Les lectures (identité, statistiques, commentaires) restent réelles.
 */
export function modeSimulation(): boolean {
  return raisonSimulation() !== null;
}

export function raisonSimulation(): string | null {
  if (process.env.SOCIAL_DRY_RUN?.trim() !== "false") return "SOCIAL_DRY_RUN n’est pas égal à « false »";
  if (process.env.VERCEL_ENV !== "production") return `environnement « ${process.env.VERCEL_ENV || "local"} » (la publication réelle n’est possible qu’en production)`;
  return null;
}

export function urlApplication(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL n’est pas configurée");
  return url;
}

export function redirectUriSocial(fournisseur: "meta" | "linkedin") {
  return `${urlApplication()}/api/social/oauth/${fournisseur}/callback`;
}

export function configMeta() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  return {
    appId,
    appSecret,
    version: process.env.META_GRAPH_API_VERSION?.trim() || META_GRAPH_VERSION_DEFAUT,
    // Facebook Login for Business : identifiant de configuration (facultatif).
    configId: process.env.META_LOGIN_CONFIG_ID?.trim() || null,
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null,
    configure: Boolean(appId && appSecret),
  };
}

export function configLinkedIn() {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  return {
    clientId,
    clientSecret,
    version: process.env.LINKEDIN_API_VERSION?.trim() || LINKEDIN_VERSION_DEFAUT,
    organisationId: process.env.LINKEDIN_ORGANIZATION_ID?.trim() || null,
    configure: Boolean(clientId && clientSecret),
  };
}

// Scopes minimums. Les fonctions qui exigent un scope absent sont affichées
// comme indisponibles au lieu d'être simulées.
export const SCOPES_META = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_read_user_content",
  "pages_manage_engagement",
  "pages_manage_metadata",
  "read_insights",
  "pages_messaging",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
  "instagram_manage_messages",
  "business_management",
] as const;

export const SCOPES_LINKEDIN = [
  "w_organization_social",
  "r_organization_social",
  "rw_organization_admin",
] as const;
