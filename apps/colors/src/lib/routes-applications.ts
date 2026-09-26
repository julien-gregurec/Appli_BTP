import "server-only";
import type { ApplicationElsatiaAutorisee } from "@elsatia/application-access";

export type EnvironnementApplications = "local" | "preview" | "production";

export function environnementApplications(): EnvironnementApplications {
  const valeur = process.env.ELSATIA_APPLICATION_ENV;
  if (valeur === "preview" || valeur === "production") return valeur;
  return "local";
}

export function urlApplication(
  application: ApplicationElsatiaAutorisee,
  environnement = environnementApplications(),
): string | null {
  const urlCatalogue = environnement === "production"
    ? application.urlProduction
    : environnement === "preview"
      ? application.urlPreview
      : application.urlLocale;

  return urlCatalogue;
}
