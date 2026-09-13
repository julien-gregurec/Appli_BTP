/**
 * Visibilité du badge « GP V1 PREVIEW » — module PUR.
 *
 * Le badge n'existe que sur un environnement de preview / staging. Deux verrous indépendants, en plus
 * du drapeau explicite `NEXT_PUBLIC_GP_PREVIEW_BADGE=1` (posé sur l'environnement Preview de Vercel) :
 * un déploiement promu en Production (`VERCEL_ENV=production`) ou servi sous l'adresse publique de
 * Production (`NEXT_PUBLIC_APP_URL` = app.elsatia.fr) ne l'affiche jamais, même si la variable avait
 * été copiée par erreur. Décision de Julien (recette preview, 2026-09-13).
 */
export type EnvironnementBadge = {
  drapeau: string | undefined;
  vercelEnv: string | undefined;
  appUrl: string | undefined;
};

export const HOTE_PRODUCTION = "app.elsatia.fr";

export function badgePreviewVisible(env: EnvironnementBadge): boolean {
  if (env.drapeau !== "1") return false;
  if ((env.vercelEnv ?? "").toLowerCase() === "production") return false;
  const url = (env.appUrl ?? "").trim().toLowerCase();
  if (url) {
    try {
      const hote = new URL(url.includes("://") ? url : `https://${url}`).hostname;
      if (hote === HOTE_PRODUCTION) return false;
    } catch {
      /* adresse illisible : le drapeau seul décide */
    }
  }
  return true;
}
