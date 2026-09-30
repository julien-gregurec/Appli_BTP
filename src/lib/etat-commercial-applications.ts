import type { SupabaseClient } from "@supabase/supabase-js";

// Per-App Commercial Suspension V1 (migration 20260929000801,
// docs/qualification/ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1.md).
//
// Chemin minimal de facturation : l'état commercial de CHAQUE application de
// l'entreprise, lisible même quand une application (ou le compte entier) est
// suspendue. Évalué en base par `etat_commercial_applications` (membre actif ou
// support ; `peut_gerer` = gerer_parametres ou support) : aucun identifiant Stripe,
// aucun motif de sécurité, aucune donnée métier. Affichage seulement — il n'autorise
// rien ; chaque application redécide en base (`a_acces_application`).

export const MOTIF_SUSPENSION_PLATEFORME = "suspension_plateforme" as const;

export type CompteGlobal = "ACCOUNT_GLOBAL_ACTIVE" | "ACCOUNT_GLOBAL_SUSPENDED";

export type EtatCommercialApplication = {
  applicationCode: string;
  nom: string;
  statut: string | null;
  accesOuvert: boolean;
  compteGlobal: CompteGlobal;
  essaiFin: string | null;
  peutGerer: boolean;
};

const LIBELLES: Record<string, string> = {
  entitled: "Accès accordé",
  trial: "Essai en cours",
  active: "Abonnement actif",
  past_due: "Paiement en retard",
  unpaid: "Impayé",
  cancelled: "Abonnement résilié",
  suspended: "Suspendu",
};

export function libelleStatutCommercial(statut: string | null): string {
  return (statut && LIBELLES[statut]) || "Non souscrit";
}

export function normaliserEtatsCommerciaux(lignes: unknown): EtatCommercialApplication[] {
  if (!Array.isArray(lignes)) return [];
  return lignes.flatMap((ligne: Record<string, unknown>) => {
    if (typeof ligne?.application_code !== "string" || typeof ligne.nom !== "string") return [];
    return [{
      applicationCode: ligne.application_code,
      nom: ligne.nom,
      statut: typeof ligne.statut_commercial === "string" ? ligne.statut_commercial : null,
      accesOuvert: ligne.acces_ouvert === true,
      compteGlobal: ligne.compte_global === "ACCOUNT_GLOBAL_SUSPENDED" ? "ACCOUNT_GLOBAL_SUSPENDED" : "ACCOUNT_GLOBAL_ACTIVE",
      essaiFin: typeof ligne.essai_fin === "string" ? ligne.essai_fin : null,
      peutGerer: ligne.peut_gerer === true,
    }];
  });
}

/** Le compte entier est-il suspendu par la plateforme ? (au moins une ligne le dit) */
export function compteSuspenduGlobalement(etats: EtatCommercialApplication[]): boolean {
  return etats.some((etat) => etat.compteGlobal === "ACCOUNT_GLOBAL_SUSPENDED");
}

/** Applications encore ouvertes alors que Gestion Pro est fermé (cas « GP impayé, Tools payé »). */
export function applicationsOuvertesHorsGestionPro(etats: EtatCommercialApplication[]): EtatCommercialApplication[] {
  return etats.filter((etat) => etat.applicationCode !== "gestion_pro" && etat.accesOuvert);
}

export async function etatsCommerciauxApplications(
  supabase: SupabaseClient,
  entrepriseId: string,
): Promise<EtatCommercialApplication[]> {
  const { data, error } = await supabase.rpc("etat_commercial_applications", { p_entreprise_id: entrepriseId });
  if (error) return [];
  return normaliserEtatsCommerciaux(data);
}
