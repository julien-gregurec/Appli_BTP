import type { ApplicationElsatiaAutorisee, CodeApplicationElsatia } from "@elsatia/application-access";

export type DestinationApplication = {
  code: CodeApplicationElsatia;
  nom: string;
  url: string | null;
  active: boolean;
  estAdminPlateforme: boolean;
};

export function construireSelecteurApplications(
  autorisees: ApplicationElsatiaAutorisee[],
  obtenirUrl: (application: ApplicationElsatiaAutorisee) => string | null,
  applicationCourante: CodeApplicationElsatia,
): DestinationApplication[] {
  return autorisees.map((application) => ({
    code: application.applicationCode,
    nom: application.nom,
    url: obtenirUrl(application),
    active: application.applicationCode === applicationCourante,
    estAdminPlateforme: application.estAdminPlateforme,
  }));
}
