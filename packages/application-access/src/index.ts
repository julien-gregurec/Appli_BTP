export const CODES_APPLICATIONS_ELSATIA = ["gestion_pro", "colors", "tools"] as const;
export type CodeApplicationElsatia = string;

export const ROLES_COLORS = [
  "colors_admin_organisation",
  "colors_gestionnaire_stock",
  "colors_utilisateur_depot",
  "colors_consultation",
] as const;
export type RoleColors = (typeof ROLES_COLORS)[number];

export const ROLE_ADMIN_PLATEFORME = "administrateur_plateforme_global" as const;
export type RoleApplicationColors = RoleColors | typeof ROLE_ADMIN_PLATEFORME;

export type ContexteAccesApplication = {
  entrepriseId: string | null;
};

export type ApplicationElsatiaAutorisee = {
  applicationCode: CodeApplicationElsatia;
  nom: string;
  roleCode: string;
  urlLocale: string | null;
  urlPreview: string | null;
  urlProduction: string | null;
  icone: string | null;
  estAdminPlateforme: boolean;
};

type ReponseRpc<T> = PromiseLike<{
  data: T | null;
  error: { message: string } | null;
}>;

export type ClientAccesApplications = {
  rpc: (
    fonction: string,
    parametres: Record<string, unknown>,
  ) => ReponseRpc<unknown>;
};

export class AccesApplicationRefuseError extends Error {
  constructor(public readonly applicationCode: CodeApplicationElsatia) {
    super(`Accès refusé à l’application ${applicationCode}`);
    this.name = "AccesApplicationRefuseError";
  }
}

export function estCodeApplicationElsatia(
  value: unknown,
): value is CodeApplicationElsatia {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,49}$/.test(value);
}

export function estRoleColors(value: unknown): value is RoleColors {
  return typeof value === "string" && ROLES_COLORS.includes(value as RoleColors);
}

export function creerControleAccesApplications(
  creerClient: () => Promise<ClientAccesApplications>,
) {
  async function verifierAccesApplication(
    ctx: ContexteAccesApplication,
    applicationCode: CodeApplicationElsatia,
  ): Promise<boolean> {
    const client = await creerClient();
    const { data, error } = await client.rpc("a_acces_application", {
      p_entreprise_id: ctx.entrepriseId,
      p_application_code: applicationCode,
    });
    if (error) throw new Error("Vérification d’accès indisponible");
    return data === true;
  }

  async function exigerAccesApplication(
    ctx: ContexteAccesApplication,
    applicationCode: CodeApplicationElsatia,
  ): Promise<void> {
    if (!(await verifierAccesApplication(ctx, applicationCode))) {
      throw new AccesApplicationRefuseError(applicationCode);
    }
  }

  async function listerApplicationsAutorisees(
    ctx: ContexteAccesApplication,
  ): Promise<ApplicationElsatiaAutorisee[]> {
    const client = await creerClient();
    const { data, error } = await client.rpc("applications_autorisees", {
      p_entreprise_id: ctx.entrepriseId,
    });
    if (error) throw new Error("Sélecteur d’applications indisponible");
    if (!Array.isArray(data)) return [];

    return data.flatMap((ligne: {
      application_code?: unknown;
      nom?: unknown;
      role_code?: unknown;
      url_locale?: unknown;
      url_preview?: unknown;
      url_production?: unknown;
      icone?: unknown;
      est_admin_plateforme?: unknown;
    }) => {
      if (
        !estCodeApplicationElsatia(ligne.application_code) ||
        typeof ligne.nom !== "string" ||
        typeof ligne.role_code !== "string"
      ) {
        return [];
      }
      const url = (valeur: unknown) =>
        typeof valeur === "string" ? valeur : null;
      return [
        {
          applicationCode: ligne.application_code,
          nom: ligne.nom,
          roleCode: ligne.role_code,
          urlLocale: url(ligne.url_locale),
          urlPreview: url(ligne.url_preview),
          urlProduction: url(ligne.url_production),
          icone: typeof ligne.icone === "string" ? ligne.icone : null,
          estAdminPlateforme: ligne.est_admin_plateforme === true,
        },
      ];
    });
  }

  return {
    verifierAccesApplication,
    exigerAccesApplication,
    listerApplicationsAutorisees,
  };
}
