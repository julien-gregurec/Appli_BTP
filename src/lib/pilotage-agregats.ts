import type { SupabaseClient } from "@supabase/supabase-js";

// Indicateurs de pilotage calculés en base (ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1,
// migration 20260930000402) : jsonb non plafonné par `max_rows`, visibilité RLS
// reproduite. En cas d'erreur, une exception : la page affiche « indisponible »
// plutôt qu'un total partiel.

const nombre = (valeur: unknown) => Number(valeur ?? 0);

async function rpc<T>(supabase: SupabaseClient, nom: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nom, args);
  if (error || data === null || data === undefined) throw new Error(`${nom} indisponible : ${error?.message ?? "réponse vide"}`);
  return data as T;
}

export type SynthesePaie = { nb: number; indemnitesDeplacement: number; primes: number; notesFrais: number; acomptes: number; nbAnomalies: number };

export async function lireSynthesePaie(supabase: SupabaseClient, entrepriseId: string, periodeId: string, filtres: { statut?: string; recherche?: string; dossierId?: string | null }): Promise<SynthesePaie> {
  const d = await rpc<Record<string, unknown>>(supabase, "paie_periode_synthese", {
    p_entreprise_id: entrepriseId, p_periode_id: periodeId,
    p_statut: filtres.statut || null, p_recherche: filtres.recherche?.replace(/[,()]/g, "") || null, p_dossier_id: filtres.dossierId ?? null,
  });
  return {
    nb: nombre(d.nb),
    indemnitesDeplacement: nombre(d.total_paniers) + nombre(d.total_trajets) + nombre(d.total_transports) + nombre(d.total_grands_deplacements),
    primes: nombre(d.total_primes), notesFrais: nombre(d.total_notes_frais), acomptes: nombre(d.total_acomptes), nbAnomalies: nombre(d.nb_anomalies),
  };
}

export type GroupeNotesFrais = { employeId: string | null; nom: string | null; nb: number; total: number; aVerifier: number };

export async function lireSyntheseNotesFraisParEmploye(supabase: SupabaseClient, entrepriseId: string, filtres: { statut?: string; categorie?: string; chantierId?: string; employeId?: string }): Promise<GroupeNotesFrais[]> {
  const lignes = await rpc<Array<Record<string, unknown>>>(supabase, "notes_frais_synthese_employes", {
    p_entreprise_id: entrepriseId, p_statut: filtres.statut || null, p_categorie: filtres.categorie || null,
    p_chantier_id: filtres.chantierId || null, p_employe_id: filtres.employeId || null,
  });
  return lignes.map((l) => ({ employeId: (l.employe_id as string | null) ?? null, nom: (l.nom as string | null) ?? null, nb: nombre(l.nb), total: nombre(l.total), aVerifier: nombre(l.a_verifier) }));
}

export type SyntheseCrm = { nbARelancer: number; resteAEncaisser: number; rappelsOuverts: number };

export async function lireSyntheseCrm(supabase: SupabaseClient, entrepriseId: string): Promise<SyntheseCrm> {
  const d = await rpc<Record<string, unknown>>(supabase, "gp_crm_synthese", { p_entreprise_id: entrepriseId });
  return { nbARelancer: nombre(d.nb_a_relancer), resteAEncaisser: nombre(d.reste_a_encaisser), rappelsOuverts: nombre(d.rappels_ouverts) };
}

export type ChantierDashboard = { id: string; nom: string; statut: string; date_fin_prevue: string | null };
export type DashboardChantiers = { parStatut: { statut: string; nb: number }[]; nbActifs: number; actifs: ChantierDashboard[]; nbEnRetard: number; enRetard: ChantierDashboard[] };

export async function lireDashboardChantiers(supabase: SupabaseClient, entrepriseId: string, aujourdhui: string): Promise<DashboardChantiers> {
  const d = await rpc<{ par_statut: { statut: string; nb: number }[]; nb_actifs: number; actifs: ChantierDashboard[]; nb_en_retard: number; en_retard: ChantierDashboard[] }>(supabase, "gp_dashboard_chantiers", { p_entreprise_id: entrepriseId, p_aujourdhui: aujourdhui, p_limite: 6 });
  return { parStatut: d.par_statut.map((s) => ({ statut: s.statut, nb: nombre(s.nb) })), nbActifs: nombre(d.nb_actifs), actifs: d.actifs, nbEnRetard: nombre(d.nb_en_retard), enRetard: d.en_retard };
}

export type ArticleAlerte = { id: string; reference: string; designation: string; quantite_stock: number; seuil_alerte: number; unite: string };
export type AlertesStock = { nb: number; nbRuptures: number; articles: ArticleAlerte[] };

export async function lireAlertesStock(supabase: SupabaseClient, entrepriseId: string, limite = 50): Promise<AlertesStock> {
  const d = await rpc<{ nb: number; nb_ruptures: number; articles: ArticleAlerte[] }>(supabase, "gp_alertes_stock", { p_entreprise_id: entrepriseId, p_limite: limite });
  return { nb: nombre(d.nb), nbRuptures: nombre(d.nb_ruptures), articles: d.articles };
}
