import {
  environnementNavigationServeur,
  urlApplicationPourEnvironnement,
  type ApplicationElsatiaAutorisee,
} from "@elsatia/application-access";

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

/**
 * Environnement de navigation (A-08, `@elsatia/application-access`) : valeur inconnue, ou
 * déploiement Vercel non déclaré → `null`, donc aucun lien inter-applications. Absente sur un
 * poste de développement → `local`.
 */
export function environnementApplications(
  valeur = process.env.ELSATIA_APPLICATION_ENV,
  vercelEnv = process.env.VERCEL_ENV,
): EnvironnementApplications | null {
  return environnementNavigationServeur({ ELSATIA_APPLICATION_ENV: valeur, VERCEL_ENV: vercelEnv });
}

/**
 * URL d'une application du catalogue pour l'environnement courant, validée : jamais une URL
 * de Production en Preview, jamais une URL hors Production en Production, jamais de repli
 * d'un environnement sur un autre. `null` = lien non proposé.
 */
export function urlApplication(
  application: Pick<ApplicationElsatiaAutorisee, "urlLocale" | "urlPreview" | "urlProduction">,
  environnement: EnvironnementApplications | null = environnementApplications(),
): string | null {
  return urlApplicationPourEnvironnement(application, environnement);
}

export function construireSelecteurApplications(
  applications: ApplicationElsatiaAutorisee[],
  applicationCourante = "gestion_pro",
  environnement: EnvironnementApplications | null = environnementApplications(),
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

// valeurDateHeureLocale (rendu datetime-local dans le fuseau du SERVEUR) retirée en post-V9
// (V9-01) : voir src/lib/date-heure-locale.ts et src/components/ChampDateHeure.tsx.
