import { createClient } from "@/lib/supabase/server";

/**
 * Modules optionnels de Gestion Pro (ELSATIA-MODULES-A-LA-CARTE-R3).
 *
 * Accès = ENTITLEMENT ENTREPRISE (table `modules_entreprises` ou inclusion
 * forfait via `modules_gestion_pro.plans_inclus`) + HABILITATION / PERMISSION
 * UTILISATEUR (rôle du poste). La résolution fait autorité côté base :
 *  - `module_gestion_pro_actif_entreprise(entreprise, code)`
 *  - `a_acces_module_gestion_pro(entreprise, code, permission?)`
 *  - `acces_module_pour_permission(entreprise, permissions[])` (utilisé par le proxy,
 *    en OU avec `permissionIncluseDansOffre` — n'enlève jamais un accès existant).
 *
 * Ce module TS ne porte AUCUN prix (pricing canonique/externe, R4). Il sert au
 * typage et à l'affichage. Le catalogue de référence est la table
 * `public.modules_gestion_pro` (seed migration 20260903000257).
 */

export type StatutCatalogueModule = "actif" | "bientot" | "interne" | "non_vendable";
export type ModeApresDesactivation = "lecture_seule" | "inaccessible" | "export_uniquement";

export const MODULES_GESTION_PRO_CODES = [
  "chantier",
  "pointage",
  "planning_avance",
  "scan_ocr",
  "notes_frais",
  "vehicules",
  "materiel",
  "stock",
  "maintenance",
  "safety",
  "forms",
  "signature",
  "connect",
  "rentabilite_avancee",
  "facturation_electronique",
  "automations",
  "ia",
  "stockage_supplementaire",
  "sauvegarde_renforcee",
] as const;

export type ModuleGestionProCode = (typeof MODULES_GESTION_PRO_CODES)[number];

export type LigneModuleEtat = {
  moduleCode: ModuleGestionProCode;
  nom: string;
  description: string | null;
  categorie: string;
  statutCatalogue: StatutCatalogueModule;
  ordre: number;
  modeApresDesactivation: ModeApresDesactivation;
  inclusPlan: boolean;
  entitlementActif: boolean;
  origine: string | null;
  valideDu: string | null;
  valideJusqu: string | null;
  /** Le module est réellement accessible à l'entreprise (inclusion plan OU entitlement). */
  disponible: boolean;
};

type LigneEtatBrute = {
  module_code?: string | null;
  nom?: string | null;
  description?: string | null;
  categorie?: string | null;
  statut_catalogue?: string | null;
  ordre?: number | null;
  mode_apres_desactivation?: string | null;
  inclus_plan?: boolean | null;
  entitlement_actif?: boolean | null;
  origine?: string | null;
  valide_du?: string | null;
  valide_jusqu?: string | null;
};

/** État consolidé des modules pour l'entreprise (UI abonnement). */
export async function lireModulesEntreprise(entrepriseId: string): Promise<LigneModuleEtat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("modules_entreprise_etat", {
    p_entreprise_id: entrepriseId,
  });
  if (error || !data) {
    if (error) console.error("lireModulesEntreprise", error);
    return [];
  }
  return (data as LigneEtatBrute[]).map((row) => {
    const inclusPlan = Boolean(row.inclus_plan);
    const entitlementActif = Boolean(row.entitlement_actif);
    return {
      moduleCode: (row.module_code ?? "") as ModuleGestionProCode,
      nom: row.nom ?? "",
      description: row.description ?? null,
      categorie: row.categorie ?? "gestion",
      statutCatalogue: (row.statut_catalogue ?? "bientot") as StatutCatalogueModule,
      ordre: Number(row.ordre ?? 100),
      modeApresDesactivation: (row.mode_apres_desactivation ?? "inaccessible") as ModeApresDesactivation,
      inclusPlan,
      entitlementActif,
      origine: row.origine ?? null,
      valideDu: row.valide_du ?? null,
      valideJusqu: row.valide_jusqu ?? null,
      disponible: inclusPlan || entitlementActif,
    };
  });
}

/** Garde serveur ponctuel (route/handler) pour un module + permission optionnelle. */
export async function aAccesModuleGestionPro(
  entrepriseId: string,
  moduleCode: ModuleGestionProCode,
  permission?: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("a_acces_module_gestion_pro", {
    p_entreprise_id: entrepriseId,
    p_module_code: moduleCode,
    p_permission: permission ?? null,
  });
  if (error) {
    console.error("aAccesModuleGestionPro", error);
    return false;
  }
  return data === true;
}
