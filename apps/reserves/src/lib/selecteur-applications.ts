import {
  urlApplicationPourEnvironnement,
  type ApplicationElsatiaAutorisee,
  type EnvironnementNavigation,
} from "@elsatia/application-access";

export type LienApplication = { code: string; nom: string; url: string };

/**
 * Liens de Réserves vers les autres applications ELSATIA ouvertes à l'utilisateur (A-08, A-09).
 * Source : le catalogue `applications_autorisees` (jamais d'URL codée en dur). Chaque URL est
 * validée pour l'environnement : une application sans URL sûre n'est simplement pas proposée —
 * jamais de bascule Preview → Production.
 */
export function construireLiensApplications(
  autorisees: ApplicationElsatiaAutorisee[],
  environnement: EnvironnementNavigation | null,
): LienApplication[] {
  return autorisees.flatMap((application) => {
    if (application.applicationCode === "reserves") return [];
    const url = urlApplicationPourEnvironnement(application, environnement);
    return url ? [{ code: application.applicationCode, nom: application.nom, url }] : [];
  });
}
