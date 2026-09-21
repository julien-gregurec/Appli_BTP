import type { ApplicationElsatiaAutorisee } from "@elsatia/application-access";

export type EnvironnementApplications = "local" | "preview" | "production";

export type DestinationApplication = {
  code: string;
  nom: string;
  url: string | null;
  active: boolean;
};

export type ApplicationCatalogue = {
  code: string;
  nom: string;
  description: string | null;
  actif: boolean;
  ordre: number;
  url_locale: string | null;
  url_preview: string | null;
  url_production: string | null;
  icone: string | null;
  statut_produit: string;
};

export const LIBELLES_ROLES_APPLICATIONS: Record<string, string> = {
  gestion_pro_admin: "Administrateur ELSATIA Gestion Pro",
  gestion_pro_utilisateur: "Utilisateur ELSATIA Gestion Pro",
  colors_admin_organisation: "Administrateur ELSATIA Colors",
  colors_gestionnaire_stock: "Gestionnaire de stock ELSATIA Colors",
  colors_utilisateur_depot: "Utilisateur de dépôt ELSATIA Colors",
  colors_consultation: "Consultation ELSATIA Colors",
  administrateur_plateforme_global: "Administration ELSATIA",
};

export function environnementApplications(
  valeur = process.env.ELSATIA_APPLICATION_ENV,
): EnvironnementApplications {
  if (valeur === "preview" || valeur === "production") return valeur;
  return "local";
}

export function urlApplication(
  application: Pick<ApplicationElsatiaAutorisee, "urlLocale" | "urlPreview" | "urlProduction">,
  environnement = environnementApplications(),
): string | null {
  if (environnement === "production") return application.urlProduction;
  if (environnement === "preview") return application.urlPreview;
  return application.urlLocale;
}

export function construireSelecteurApplications(
  applications: ApplicationElsatiaAutorisee[],
  applicationCourante = "gestion_pro",
  environnement = environnementApplications(),
): DestinationApplication[] {
  return applications.map((application) => ({
    code: application.applicationCode,
    nom: application.nom,
    url: urlApplication(application, environnement),
    active: application.applicationCode === applicationCourante,
  }));
}

export function libelleRoleApplication(code: string): string {
  return LIBELLES_ROLES_APPLICATIONS[code] ?? code;
}

export function accesDansSaFenetre(
  acces: { autorise: boolean; valide_du: string | null; valide_jusqu_au: string | null } | null,
  maintenant = Date.now(),
): boolean {
  return acces?.autorise === true
    && (!acces.valide_du || new Date(acces.valide_du).getTime() <= maintenant)
    && (!acces.valide_jusqu_au || new Date(acces.valide_jusqu_au).getTime() > maintenant);
}

export function valeurDateHeureLocale(valeur: string | null): string {
  if (!valeur) return "";
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "";
  const decalage = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 16);
}
