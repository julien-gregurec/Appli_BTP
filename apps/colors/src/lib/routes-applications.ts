import "server-only";
import {
  environnementNavigationServeur,
  urlApplicationPourEnvironnement,
  type ApplicationElsatiaAutorisee,
} from "@elsatia/application-access";

export type EnvironnementApplications = "local" | "preview" | "production";

/**
 * Environnement de navigation (A-08) : valeur inconnue, ou déploiement Vercel non déclaré
 * → `null`, donc aucun lien inter-applications ; absente en développement → `local`.
 */
export function environnementApplications(
  env: { ELSATIA_APPLICATION_ENV?: string; VERCEL_ENV?: string } = {
    ELSATIA_APPLICATION_ENV: process.env.ELSATIA_APPLICATION_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  },
): EnvironnementApplications | null {
  return environnementNavigationServeur(env);
}

/**
 * URL du catalogue pour l'environnement, validée par `@elsatia/application-access` : jamais
 * une URL de Production depuis une Preview (ni l'inverse), jamais de repli d'un environnement
 * sur un autre. `null` = « URL à configurer », jamais un lien vers un autre environnement.
 */
export function urlApplication(
  application: Pick<ApplicationElsatiaAutorisee, "urlLocale" | "urlPreview" | "urlProduction">,
  environnement: EnvironnementApplications | null = environnementApplications(),
): string | null {
  return urlApplicationPourEnvironnement(application, environnement);
}
