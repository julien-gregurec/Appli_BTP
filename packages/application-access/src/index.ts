export const CODES_APPLICATIONS_ELSATIA = ["gestion_pro", "colors", "tools", "reserves"] as const;
export type CodeApplicationElsatia = string;

export const ROLES_COLORS = [
  "colors_admin_organisation",
  "colors_gestionnaire_stock",
  "colors_utilisateur_depot",
  "colors_consultation",
] as const;
export type RoleColors = (typeof ROLES_COLORS)[number];

export const ROLES_RESERVES = [
  "reserves_admin_organisation",
  "reserves_responsable",
  "reserves_emetteur",
  "reserves_intervenant",
  "reserves_consultation",
] as const;
export type RoleReserves = (typeof ROLES_RESERVES)[number];

export const ROLE_ADMIN_PLATEFORME = "administrateur_plateforme_global" as const;
export type RoleApplicationColors = RoleColors | typeof ROLE_ADMIN_PLATEFORME;
export type RoleApplicationReserves = RoleReserves | typeof ROLE_ADMIN_PLATEFORME;

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

export function estRoleReserves(value: unknown): value is RoleReserves {
  return typeof value === "string" && ROLES_RESERVES.includes(value as RoleReserves);
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

// ── Per-App Commercial Suspension V1 (migration 20260929000801) ──────────────
// État commercial d'une application pour une organisation. La décision d'accès reste
// en base (`a_acces_application`) ; ce qui suit ne sert qu'à EXPLIQUER un refus.
export const STATUTS_COMMERCIAUX = [
  "entitled",
  "trial",
  "active",
  "past_due",
  "unpaid",
  "cancelled",
  "suspended",
] as const;
export type StatutCommercial = (typeof STATUTS_COMMERCIAUX)[number];

export const STATUTS_COMMERCIAUX_OUVERTS: readonly StatutCommercial[] = ["entitled", "trial", "active"];

export function estStatutCommercial(value: unknown): value is StatutCommercial {
  return typeof value === "string" && STATUTS_COMMERCIAUX.includes(value as StatutCommercial);
}

/** Ligne `acces_applications_entreprises` telle que lue par l'application (RLS). */
export type LigneDroitApplication = {
  autorise?: boolean | null;
  valide_du?: string | null;
  valide_jusqu_au?: string | null;
  statut_commercial?: string | null;
  essai_fin?: string | null;
} | null | undefined;

export type DiagnosticRefusApplication = "abonnement_requis" | "habilitation_requise";

/**
 * Explique un refus d'accès : le droit de l'organisation est-il commercialement ouvert
 * (alors il manque une habilitation personnelle) ou non (abonnement requis) ?
 * Ne peut jamais autoriser : l'appelant ne l'utilise qu'après un refus de la base.
 * Même règle que `statut_commercial_application` : essai échu = fermé ; statut absent
 * (base antérieure à la migration) = droit accordé tel quel.
 */
export function diagnostiquerRefusApplication(
  ligne: LigneDroitApplication,
  maintenant: number = Date.now(),
): DiagnosticRefusApplication {
  if (!ligne || ligne.autorise !== true) return "abonnement_requis";
  if (ligne.valide_du && new Date(ligne.valide_du).getTime() > maintenant) return "abonnement_requis";
  if (ligne.valide_jusqu_au && new Date(ligne.valide_jusqu_au).getTime() <= maintenant) return "abonnement_requis";
  const statut = ligne.statut_commercial ?? "entitled";
  if (!estStatutCommercial(statut) || !STATUTS_COMMERCIAUX_OUVERTS.includes(statut)) return "abonnement_requis";
  if (statut === "trial" && (!ligne.essai_fin || new Date(ligne.essai_fin).getTime() <= maintenant)) {
    return "abonnement_requis";
  }
  return "habilitation_requise";
}

export const LIBELLES_STATUT_COMMERCIAL: Record<StatutCommercial, string> = {
  entitled: "Accès accordé",
  trial: "Essai en cours",
  active: "Abonnement actif",
  past_due: "Paiement en retard",
  unpaid: "Impayé",
  cancelled: "Abonnement résilié",
  suspended: "Suspendu",
};
