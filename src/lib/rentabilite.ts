import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rentabilité des chantiers et heures de la fiche chantier, calculées par
 * PostgreSQL (migration 20260930000301_rentabilite_agregats_chantiers_v1).
 *
 * PostgREST plafonne toute réponse à max_rows = 1 000 lignes SANS erreur :
 * additionner ici des pointages, factures, dépenses… lus sans pagination
 * donnait des heures, coûts et marges faux au-delà de 1 000 lignes. Les RPC
 * appliquent les mêmes règles de calcul que les écrans et la même visibilité
 * que la RLS ; ce module ne reçoit que des totaux ou des pages bornées.
 *
 * Toute erreur RPC est levée : jamais de total partiel présenté comme exact.
 */

export type RentabiliteLigne = {
  chantierId: string;
  budgetHt: number;
  factureHt: number;
  /** Part des avoirs (type « avoir ») incluse dans factureHt. */
  factureHtAvoirs: number;
  heures: number;
  coutMainOeuvre: number;
  coutHoraireManquant: boolean;
  coutAchats: number;
  coutSousTraitance: number;
  coutStock: number;
  coutNotesFrais: number;
  coutIndemnitesPaie: number;
  marge: number;
  taux: number | null;
};

export type RentabiliteTotaux = {
  nbChantiers: number;
  nbChantiersAvecActivite: number;
  nbChantiersCoutHoraireManquant: number;
  heures: number;
  factureHt: number;
  coutMainOeuvre: number;
  coutAchats: number;
  coutSousTraitance: number;
  coutStock: number;
  coutNotesFrais: number;
  coutIndemnitesPaie: number;
  marge: number;
  taux: number;
};

export type TriRentabilite = "recent" | "marge_desc" | "marge_asc";

export const LIMITE_PAGE_RENTABILITE = 500;

type LigneSql = Record<string, unknown>;
const nombre = (valeur: unknown) => Number(valeur ?? 0);

function erreurRpc(fonction: string, error: { message?: string } | null): Error {
  return new Error(`${fonction} : ${error?.message ?? "réponse vide"}`);
}

function versLigne(ligne: LigneSql): RentabiliteLigne {
  return {
    chantierId: String(ligne.chantier_id),
    budgetHt: nombre(ligne.budget_ht),
    factureHt: nombre(ligne.facture_ht),
    factureHtAvoirs: nombre(ligne.facture_ht_avoirs),
    heures: nombre(ligne.heures),
    coutMainOeuvre: nombre(ligne.cout_main_oeuvre),
    coutHoraireManquant: ligne.cout_horaire_manquant === true,
    coutAchats: nombre(ligne.cout_achats),
    coutSousTraitance: nombre(ligne.cout_sous_traitance),
    coutStock: nombre(ligne.cout_stock),
    coutNotesFrais: nombre(ligne.cout_notes_frais),
    coutIndemnitesPaie: nombre(ligne.cout_indemnites_paie),
    marge: nombre(ligne.marge),
    taux: ligne.taux === null || ligne.taux === undefined ? null : Number(ligne.taux),
  };
}

/** Totaux de /rentabilite (tous les chantiers visibles, sans plafond). */
export async function lireRentabiliteTotaux(supabase: SupabaseClient, entrepriseId: string): Promise<RentabiliteTotaux> {
  const { data, error } = await supabase.rpc("rentabilite_chantiers_totaux", { p_entreprise_id: entrepriseId });
  const ligne = (data as LigneSql[] | null)?.[0];
  if (error || !ligne) throw erreurRpc("rentabilite_chantiers_totaux", error);
  return {
    nbChantiers: nombre(ligne.nb_chantiers),
    nbChantiersAvecActivite: nombre(ligne.nb_chantiers_avec_activite),
    nbChantiersCoutHoraireManquant: nombre(ligne.nb_chantiers_cout_horaire_manquant),
    heures: nombre(ligne.heures),
    factureHt: nombre(ligne.facture_ht),
    coutMainOeuvre: nombre(ligne.cout_main_oeuvre),
    coutAchats: nombre(ligne.cout_achats),
    coutSousTraitance: nombre(ligne.cout_sous_traitance),
    coutStock: nombre(ligne.cout_stock),
    coutNotesFrais: nombre(ligne.cout_notes_frais),
    coutIndemnitesPaie: nombre(ligne.cout_indemnites_paie),
    marge: nombre(ligne.marge),
    taux: nombre(ligne.taux),
  };
}

/** Une page de chantiers (au plus 500 lignes, sous max_rows). */
export async function lireRentabilitePage(
  supabase: SupabaseClient,
  entrepriseId: string,
  options: { tri: TriRentabilite; limite: number; decalage: number; avecActivite?: boolean },
): Promise<RentabiliteLigne[]> {
  if (!Number.isInteger(options.limite) || options.limite < 1 || options.limite > LIMITE_PAGE_RENTABILITE) {
    throw new Error(`Page de rentabilité : 1 à ${LIMITE_PAGE_RENTABILITE} lignes.`);
  }
  const { data, error } = await supabase.rpc("rentabilite_chantiers_page", {
    p_entreprise_id: entrepriseId,
    p_tri: options.tri,
    p_limite: options.limite,
    p_decalage: options.decalage,
    p_avec_activite: options.avecActivite ?? false,
  });
  if (error || !data) throw erreurRpc("rentabilite_chantiers_page", error);
  return (data as LigneSql[]).map(versLigne);
}

/** Toutes les lignes, par pages de 500 jusqu'à épuisement (une ligne par chantier). */
export async function lireToutesRentabilitesChantiers(supabase: SupabaseClient, entrepriseId: string, tri: TriRentabilite): Promise<RentabiliteLigne[]> {
  const lignes: RentabiliteLigne[] = [];
  for (let decalage = 0; ; decalage += LIMITE_PAGE_RENTABILITE) {
    const page = await lireRentabilitePage(supabase, entrepriseId, { tri, limite: LIMITE_PAGE_RENTABILITE, decalage });
    lignes.push(...page);
    if (page.length < LIMITE_PAGE_RENTABILITE) return lignes;
  }
}

/** Un chantier (analyse IA) ; null s'il n'est pas consultable. */
export async function lireRentabiliteChantier(supabase: SupabaseClient, entrepriseId: string, chantierId: string): Promise<RentabiliteLigne | null> {
  const { data, error } = await supabase.rpc("rentabilite_chantier", { p_entreprise_id: entrepriseId, p_chantier_id: chantierId });
  if (error || !data) throw erreurRpc("rentabilite_chantier", error);
  const ligne = (data as LigneSql[])[0];
  return ligne ? versLigne(ligne) : null;
}

export type HeuresChantier = { heuresPlanifiees: number; nbAffectations: number; heuresValidees: number; nbPointagesValides: number };

/** Heures planifiées / validées de la fiche chantier (sans plafond). */
export async function lireHeuresChantier(supabase: SupabaseClient, entrepriseId: string, chantierId: string): Promise<HeuresChantier> {
  const { data, error } = await supabase.rpc("chantier_heures_synthese", { p_entreprise_id: entrepriseId, p_chantier_id: chantierId });
  const ligne = (data as LigneSql[] | null)?.[0];
  if (error || !ligne) throw erreurRpc("chantier_heures_synthese", error);
  return {
    heuresPlanifiees: nombre(ligne.heures_planifiees),
    nbAffectations: nombre(ligne.nb_affectations),
    heuresValidees: nombre(ligne.heures_validees),
    nbPointagesValides: nombre(ligne.nb_pointages_valides),
  };
}

export type RentabiliteChantier = {
  chantierId: string;
  chantierNom: string;
  budgetHt: number;
  factureHt: number;
  heures: number;
  coutMainOeuvre: number;
  coutAchats: number;
  coutSousTraitance: number;
  marge: number;
  taux: number | null;
};

/**
 * Copilote : chantiers actifs, plus faibles marges d'abord.
 * Règle historique du copilote conservée : CA hors avoirs, marge = CA − main-d'œuvre
 * pointée − achats/charges − sous-traitance. Heures : pointages validés, règle
 * produit de /rentabilite (14f1112), que ce chemin n'appliquait pas.
 */
export async function calculerRentabiliteChantiers(supabase: SupabaseClient, entrepriseId: string, options: { limite: number }): Promise<RentabiliteChantier[]> {
  const lignes = (await lireToutesRentabilitesChantiers(supabase, entrepriseId, "marge_asc"))
    .map((ligne) => {
      const factureHt = ligne.factureHt - ligne.factureHtAvoirs;
      const marge = factureHt - ligne.coutMainOeuvre - ligne.coutAchats - ligne.coutSousTraitance;
      return {
        chantierId: ligne.chantierId,
        budgetHt: ligne.budgetHt,
        factureHt,
        heures: ligne.heures,
        coutMainOeuvre: ligne.coutMainOeuvre,
        coutAchats: ligne.coutAchats,
        coutSousTraitance: ligne.coutSousTraitance,
        marge,
        taux: factureHt > 0 ? (marge / factureHt) * 100 : null,
      };
    })
    .filter((l) => l.factureHt > 0 || l.coutMainOeuvre > 0 || l.coutAchats > 0 || l.coutSousTraitance > 0)
    .sort((a, b) => a.marge - b.marge)
    .slice(0, options.limite);
  if (!lignes.length) return [];
  const { data: chantiers, error } = await supabase.from("chantiers").select("id, nom").eq("entreprise_id", entrepriseId).in("id", lignes.map((l) => l.chantierId));
  if (error) throw new Error(`chantiers : ${error.message}`);
  const noms = new Map((chantiers ?? []).map((c) => [c.id as string, c.nom as string]));
  return lignes.map((l) => ({ ...l, chantierNom: noms.get(l.chantierId) ?? "Chantier" }));
}

/**
 * Fiche chantier : identifiants d'une page de pointages validés (plus récents
 * d'abord, au plus 200). La page relit ensuite ces lignes sous la RLS normale.
 */
export async function lirePagePointagesValidesChantier(supabase: SupabaseClient, entrepriseId: string, chantierId: string, options: { limite: number; decalage: number }): Promise<string[]> {
  const { data, error } = await supabase.rpc("chantier_pointages_valides_page", {
    p_entreprise_id: entrepriseId,
    p_chantier_id: chantierId,
    p_limite: options.limite,
    p_decalage: options.decalage,
  });
  if (error || !data) throw erreurRpc("chantier_pointages_valides_page", error);
  return (data as LigneSql[]).map((ligne) => String(ligne.pointage_id));
}
