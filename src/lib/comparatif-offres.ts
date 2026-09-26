import { permissionIncluseDansOffre, type CodeOffreTarifaire } from "@/lib/tarification";
import { FEATURE_CATALOGUE, type FeatureKey } from "@/lib/feature-catalogue";

/**
 * Mapping unique tarification ↔ features (ABONNEMENTS-DETAIL-V1B).
 *
 * Deux sources de vérité existent déjà et sont volontairement restées séparées :
 * - tarification.ts (`fonctionnalites` par offre) : ce que le PLAN autorise.
 * - feature-catalogue.ts (CORE/BETA/DISABLED) : ce que le PRODUIT expose réellement,
 *   indépendamment du plan (un module BETA reste BETA même si le plan l'autorise).
 *
 * Ce fichier ne fait que COMBINER les deux, sans créer de troisième source de vérité :
 * aucun montant, aucune permission, aucun statut n'est ici recalculé ou deviné.
 *
 * Chaque ligne du comparatif ne référence QUE des capacités réellement vérifiables
 * (une clé de permission existante dans tarification.ts) — volontairement omis :
 * PDF/email/relances (non séparément permissionnés, intégrés à devis/factures),
 * alertes opérationnelles/délégation (accessibles dès le dashboard, non plan-gated),
 * documents/photos de chantier, comptes-rendus (non séparément permissionnés —
 * périmètre de l'audit transverse PIECES-JOINTES-V1, pas de ce lot).
 */

export type EtatCommercial = "inclus" | "limite" | "non_inclus" | "beta" | "desactive";

export type LigneComparatif = {
  cle: string;
  label: string;
  permission: string;
  feature?: FeatureKey;
};

export type CategorieComparatif = {
  cle: string;
  titre: string;
  lignes: readonly LigneComparatif[];
};

export const CATEGORIES_COMPARATIF: readonly CategorieComparatif[] = [
  {
    cle: "commercial",
    titre: "Commercial",
    lignes: [
      { cle: "clients", label: "Clients", permission: "acces_clients", feature: "clients" },
      { cle: "devis", label: "Devis", permission: "acces_devis", feature: "quotes" },
      { cle: "factures", label: "Factures", permission: "acces_factures", feature: "invoices" },
      { cle: "facturation_avancee", label: "Facturation avancée (situations de travaux)", permission: "acces_facturation_avancee", feature: "advanced_invoicing" },
      { cle: "crm", label: "CRM", permission: "acces_crm", feature: "crm" },
      { cle: "appels_offres", label: "Appels d'offres", permission: "acces_appels_offres", feature: "tenders" },
      { cle: "paiements_bancaires", label: "Paiements bancaires", permission: "acces_paiements_bancaires", feature: "banking" },
    ],
  },
  {
    cle: "chantiers",
    titre: "Chantiers",
    lignes: [
      { cle: "chantiers", label: "Chantiers", permission: "acces_chantiers", feature: "jobs" },
      { cle: "interventions", label: "Interventions", permission: "acces_interventions", feature: "interventions" },
      { cle: "ouvrages", label: "Ouvrages (bibliothèque)", permission: "acces_ouvrages", feature: "works" },
      { cle: "rentabilite_chantier", label: "Rentabilité par chantier", permission: "acces_rentabilite", feature: "profitability" },
      { cle: "sous_traitants", label: "Sous-traitants", permission: "acces_sous_traitants", feature: "subcontractors" },
    ],
  },
  {
    cle: "terrain",
    titre: "Terrain",
    lignes: [
      { cle: "planning", label: "Planning des équipes", permission: "acces_planning", feature: "planning" },
      { cle: "employes", label: "Gestion des employés", permission: "acces_employes", feature: "employees" },
      { cle: "pointage", label: "Pointage des heures", permission: "acces_pointage", feature: "time_tracking" },
      { cle: "conges", label: "Demandes de congés", permission: "demander_ses_conges", feature: "leave" },
      { cle: "notes_frais", label: "Notes de frais", permission: "saisir_ses_notes_frais", feature: "expenses" },
    ],
  },
  {
    cle: "stock_materiel",
    titre: "Stock & matériel",
    lignes: [
      { cle: "stock", label: "Gestion du stock", permission: "acces_stock", feature: "stock" },
      { cle: "borne_stock", label: "Borne stock", permission: "utiliser_borne_stock", feature: "stock_terminal" },
      { cle: "outillage", label: "Outillage", permission: "acces_outillage", feature: "tools" },
      { cle: "flotte", label: "Flotte de véhicules", permission: "acces_flotte", feature: "fleet" },
      { cle: "achats", label: "Achats & fournisseurs", permission: "acces_achats", feature: "suppliers" },
    ],
  },
  {
    cle: "pilotage",
    titre: "Pilotage",
    lignes: [
      { cle: "dashboard", label: "Tableau de bord", permission: "acces_dashboard", feature: "dashboard" },
      { cle: "rentabilite", label: "Rentabilité globale", permission: "acces_rentabilite", feature: "profitability" },
      { cle: "exports", label: "Exports comptables", permission: "acces_exports", feature: "accounting_exports" },
      { cle: "administration", label: "Administration de l'entreprise", permission: "acces_parametres", feature: "settings" },
      { cle: "connecteurs", label: "Connecteurs", permission: "acces_connecteurs", feature: "connectors" },
      { cle: "paie", label: "Gestion de la paie", permission: "gerer_paie", feature: "payroll" },
    ],
  },
] as const;

/**
 * Combine permission (tarification.ts) et statut produit (feature-catalogue.ts).
 * BETA/DISABLED prévaut toujours sur la permission : une offre ne peut jamais
 * afficher "Inclus" pour un module que le produit n'expose pas encore réellement.
 */
export function etatLigneComparatif(ligne: LigneComparatif, offre: CodeOffreTarifaire): EtatCommercial {
  const statutFeature = ligne.feature ? FEATURE_CATALOGUE[ligne.feature]?.status : "active";
  if (statutFeature === "disabled") return "desactive";
  const inclus = permissionIncluseDansOffre(ligne.permission, offre);
  if (statutFeature === "beta" || statutFeature === "experimental") return inclus ? "beta" : "non_inclus";
  return inclus ? "inclus" : "non_inclus";
}

export const LIBELLE_ETAT_COMMERCIAL: Record<EtatCommercial, string> = {
  inclus: "Inclus",
  limite: "Limité",
  non_inclus: "Non inclus",
  beta: "BETA",
  desactive: "Bientôt disponible",
};

/**
 * Ce qu'une entreprise gagnerait réellement en passant de `offreActuelle` à
 * `offreSuivante` : uniquement les modules qui deviennent Inclus ou BETA alors
 * qu'ils ne l'étaient pas avant — jamais un module encore Bientôt disponible
 * (DISABLED), qui resterait indisponible quelle que soit l'offre.
 */
export function calculerGainsOffreSuivante(offreActuelle: CodeOffreTarifaire, offreSuivante: CodeOffreTarifaire): string[] {
  return CATEGORIES_COMPARATIF.flatMap((c) => c.lignes)
    .map((ligne) => ({ ligne, avant: etatLigneComparatif(ligne, offreActuelle), apres: etatLigneComparatif(ligne, offreSuivante) }))
    .filter(({ avant, apres }) => avant === "non_inclus" && (apres === "inclus" || apres === "beta"))
    .map(({ ligne, apres }) => (apres === "beta" ? `${ligne.label} (BETA)` : ligne.label));
}

/**
 * Reduction HT appliquee par une remise commerciale sur le sous-total avant remise
 * (abonnement de base + comptes supplementaires). Reprend exactement la formule
 * appliquee par Stripe (verifiee empiriquement, REMISES-CLIENTS-V1) : un pourcentage
 * s'applique au sous-total, un montant fixe est une reduction forfaitaire, jamais
 * negative et jamais superieure au sous-total lui-meme.
 */
export function calculerReductionRemise(params: {
  type: "montant" | "pourcentage" | null | undefined;
  valeur: number | null | undefined;
  sousTotal: number;
}): number {
  const valeur = Number(params.valeur ?? 0);
  if (!params.type || !Number.isFinite(valeur) || valeur <= 0) return 0;
  const reduction = params.type === "montant" ? valeur : (params.sousTotal * valeur) / 100;
  return Math.min(Math.max(0, reduction), params.sousTotal);
}
