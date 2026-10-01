import type { SupabaseClient } from "@supabase/supabase-js";

// Totaux des fiches client, sous-traitant, véhicule, outil et chantier calculés
// en base (ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1, migration 20260930000401) :
// les fonctions renvoient du jsonb, jamais plafonné par `max_rows`, avec la
// visibilité RLS de chaque table. Une erreur est levée plutôt qu'un total
// partiel : la page affiche alors « indisponible ».

const nombre = (valeur: unknown) => Number(valeur ?? 0);

function erreur(rpc: string, error: { message: string } | null) {
  return new Error(`${rpc} indisponible : ${error?.message ?? "réponse vide"}`);
}

export type SyntheseDepenses = { nb: number; nbActives: number; totalHt: number; totalTtc: number; totalRegle: number };

export async function lireSyntheseDepenses(
  supabase: SupabaseClient,
  entrepriseId: string,
  filtre: { fournisseurId?: string; vehiculeId?: string; outilId?: string },
): Promise<SyntheseDepenses> {
  const { data, error } = await supabase.rpc("gp_depenses_synthese", {
    p_entreprise_id: entrepriseId,
    p_fournisseur_id: filtre.fournisseurId ?? null,
    p_vehicule_id: filtre.vehiculeId ?? null,
    p_outil_id: filtre.outilId ?? null,
  });
  if (error || !data) throw erreur("gp_depenses_synthese", error);
  const d = data as Record<string, unknown>;
  return { nb: nombre(d.nb), nbActives: nombre(d.nb_actives), totalHt: nombre(d.total_ht), totalTtc: nombre(d.total_ttc), totalRegle: nombre(d.total_regle) };
}

export type SyntheseClient = { nbFactures: number; totalFacture: number; totalPaye: number; nbDevis: number };

export async function lireSyntheseClient(supabase: SupabaseClient, entrepriseId: string, clientId: string): Promise<SyntheseClient> {
  const { data, error } = await supabase.rpc("gp_client_synthese", { p_entreprise_id: entrepriseId, p_client_id: clientId });
  if (error || !data) throw erreur("gp_client_synthese", error);
  const d = data as { factures: Record<string, unknown>; devis: Record<string, unknown> };
  return { nbFactures: nombre(d.factures.nb), totalFacture: nombre(d.factures.total_facture), totalPaye: nombre(d.factures.total_paye), nbDevis: nombre(d.devis.nb) };
}

export type SyntheseMissions = { nb: number; nbActives: number; previsionnelHt: number };

export async function lireSyntheseMissionsSousTraitant(supabase: SupabaseClient, entrepriseId: string, fournisseurId: string): Promise<SyntheseMissions> {
  const { data, error } = await supabase.rpc("gp_sous_traitant_missions_synthese", { p_entreprise_id: entrepriseId, p_fournisseur_id: fournisseurId });
  if (error || !data) throw erreur("gp_sous_traitant_missions_synthese", error);
  const d = data as Record<string, unknown>;
  return { nb: nombre(d.nb), nbActives: nombre(d.nb_actives), previsionnelHt: nombre(d.previsionnel_ht) };
}

// ---------------------------------------------------------------------------
// Pagination par curseur (date décroissante — NULL en tête, ordre natif de
// PostgreSQL pour DESC et des parcours arrière d'index —, puis id décroissant).
// Le coût d'une page est constant quelle que soit sa profondeur, contrairement
// à un `offset` qui fait évaluer la RLS de toutes les lignes sautées.

export type Curseur = { date: string | null; id: string };

export function lireCurseur(valeur: string | undefined | null): Curseur | null {
  if (!valeur) return null;
  const separateur = valeur.lastIndexOf("_");
  if (separateur <= 0) return null;
  const date = valeur.slice(0, separateur);
  const id = valeur.slice(separateur + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (date === "null") return { date: null, id };
  return Number.isNaN(Date.parse(date)) ? null : { date, id };
}

export function ecrireCurseur(date: string | null | undefined, id: string): string {
  return `${date ?? "null"}_${id}`;
}

/** Filtre PostgREST « strictement après le curseur » pour un ordre `colonne desc (NULL en tête), id desc`. */
export function filtreApresCurseur(colonne: string, curseur: Curseur): string {
  const date = `"${curseur.date}"`;
  return curseur.date === null
    ? `and(${colonne}.is.null,id.lt.${curseur.id}),${colonne}.not.is.null`
    : `${colonne}.lt.${date},and(${colonne}.eq.${date},id.lt.${curseur.id})`;
}

type RequeteOrdonnable<T> = {
  or(filtre: string): RequeteOrdonnable<T>;
  order(colonne: string, options: { ascending: boolean; nullsFirst?: boolean }): RequeteOrdonnable<T>;
  limit(n: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

/**
 * Lit une page de `taille` lignes après `curseur` (ordre `colonne desc` NULL en tête, `id desc`).
 * `suivant` est le curseur de la page suivante, ou null s'il n'y en a pas.
 */
export async function lirePageCurseur<T extends { id: string }>(
  requete: RequeteOrdonnable<T>,
  colonne: keyof T & string,
  taille: number,
  curseur: Curseur | null,
): Promise<{ lignes: T[]; suivant: string | null }> {
  let q = requete;
  if (curseur) q = q.or(filtreApresCurseur(colonne, curseur));
  const { data, error } = await q.order(colonne, { ascending: false, nullsFirst: true }).order("id", { ascending: false }).limit(taille + 1);
  if (error) throw new Error(`Liste indisponible : ${error.message}`);
  const lignes = (data ?? []).slice(0, taille);
  const derniere = lignes[lignes.length - 1];
  const suivant = (data ?? []).length > taille && derniere ? ecrireCurseur((derniere[colonne] as string | null) ?? null, derniere.id) : null;
  return { lignes, suivant };
}

// ---------------------------------------------------------------------------
// Pages servies par RPC (visibilité calculée une fois) : chantiers d'un client,
// documents d'un chantier.

type PageRpc<T> = { lignes: T[]; suivant: string | null };

function pageRpc<T extends { id: string; created_at: string | null }>(data: unknown): PageRpc<T> & { total?: number } {
  const d = data as { lignes: T[]; suite: boolean; total?: number };
  const derniere = d.lignes[d.lignes.length - 1];
  return { lignes: d.lignes, suivant: d.suite && derniere ? ecrireCurseur(derniere.created_at, derniere.id) : null, total: d.total === undefined ? undefined : nombre(d.total) };
}

export type ChantierClient = { id: string; reference_interne: string | null; nom: string; statut: string; ville: string | null; created_at: string | null };

export async function lireChantiersClient(supabase: SupabaseClient, entrepriseId: string, clientId: string, taille: number, curseur: Curseur | null): Promise<PageRpc<ChantierClient>> {
  const { data, error } = await supabase.rpc("gp_client_chantiers_page", {
    p_entreprise_id: entrepriseId, p_client_id: clientId, p_limite: taille,
    p_avant_created_at: curseur?.date ?? null, p_avant_id: curseur?.id ?? null,
  });
  if (error || !data) throw erreur("gp_client_chantiers_page", error);
  const { lignes, suivant } = pageRpc<ChantierClient>(data);
  return { lignes, suivant };
}

export type DocumentChantier = { id: string; nom: string; categorie: string | null; storage_path: string; mime_type: string; taille_octets: number; note: string | null; audience: string | null; created_at: string | null };

export async function lireDocumentsChantier(supabase: SupabaseClient, entrepriseId: string, chantierId: string, taille: number, curseur: Curseur | null): Promise<PageRpc<DocumentChantier> & { total: number }> {
  const { data, error } = await supabase.rpc("gp_chantier_documents_page", {
    p_entreprise_id: entrepriseId, p_chantier_id: chantierId, p_limite: taille,
    p_avant_created_at: curseur?.date ?? null, p_avant_id: curseur?.id ?? null,
  });
  if (error || !data) throw erreur("gp_chantier_documents_page", error);
  const page = pageRpc<DocumentChantier>(data);
  return { lignes: page.lignes, suivant: page.suivant, total: page.total ?? 0 };
}

// ---------------------------------------------------------------------------
// Fiche chantier : totaux chiffrés et listes récentes (chantier_synthese_chiffree).

type Personne = { prenom: string; nom: string };
export type FactureFournisseurRecente = { id: string; numero_piece: string; categorie: string; date_piece: string; statut: string; montant_ttc: number; montant_regle: number; justificatif_storage_path: string | null; fournisseur: { nom: string } | null };
export type NoteFraisRecente = { id: string; reference: string; date_frais: string; fournisseur: string | null; categorie: string | null; statut: string; montant_ttc: number; employe: Personne | null };
export type FactureRecente = { id: string; numero: string | null; statut: string; montant_ttc: number; montant_paye: number };

export type SyntheseChantier = {
  factures: { nb: number; totalFacture: number; totalPaye: number; liste: FactureRecente[] };
  facturesFournisseurs: { nb: number; totalTtc: number; totalRegle: number; liste: FactureFournisseurRecente[] };
  notesFrais: { nb: number; totalValidees: number; totalEnCours: number; liste: NoteFraisRecente[] };
};

export async function lireSyntheseChantier(supabase: SupabaseClient, entrepriseId: string, chantierId: string, droits: { achats: boolean; notes: boolean }, limite = 50): Promise<SyntheseChantier> {
  const { data, error } = await supabase.rpc("chantier_synthese_chiffree", { p_entreprise_id: entrepriseId, p_chantier_id: chantierId, p_achats: droits.achats, p_notes: droits.notes, p_limite: limite });
  if (error || !data) throw erreur("chantier_synthese_chiffree", error);
  const d = data as Record<string, Record<string, unknown>>;
  return {
    factures: { nb: nombre(d.factures.nb), totalFacture: nombre(d.factures.total_facture), totalPaye: nombre(d.factures.total_paye), liste: d.factures.liste as FactureRecente[] },
    facturesFournisseurs: { nb: nombre(d.factures_fournisseurs.nb), totalTtc: nombre(d.factures_fournisseurs.total_ttc), totalRegle: nombre(d.factures_fournisseurs.total_regle), liste: d.factures_fournisseurs.liste as FactureFournisseurRecente[] },
    notesFrais: { nb: nombre(d.notes_frais.nb), totalValidees: nombre(d.notes_frais.total_validees), totalEnCours: nombre(d.notes_frais.total_en_cours), liste: d.notes_frais.liste as NoteFraisRecente[] },
  };
}

// ---------------------------------------------------------------------------
// DOE : contenu complet du dossier (gp_doe_contenu). Le manifeste figé et
// l'écran listent TOUS les documents et articles, jamais une troncature.

export type ArticleDoe = { id: string; reference: string; designation: string; marque: string | null; quantite: number };
export type DocumentDoe = { id: string; nom: string; categorie: string; note: string | null; created_at: string | null };
export type FicheTechniqueDoe = { id: string; article_id: string; titre: string; type_document: string | null; fabricant: string | null; version: string | null };
export type ContenuDoe = { documents: DocumentDoe[]; articles: ArticleDoe[]; articleIds: string[]; fichesTechniques: FicheTechniqueDoe[] };

export async function lireContenuDoe(supabase: SupabaseClient, entrepriseId: string, chantierId: string): Promise<ContenuDoe> {
  const { data, error } = await supabase.rpc("gp_doe_contenu", { p_entreprise_id: entrepriseId, p_chantier_id: chantierId });
  if (error || !data) throw erreur("gp_doe_contenu", error);
  const d = data as { documents: DocumentDoe[]; articles: ArticleDoe[]; article_ids: string[]; fiches_techniques: FicheTechniqueDoe[] };
  return { documents: d.documents, articles: d.articles, articleIds: d.article_ids, fichesTechniques: d.fiches_techniques };
}

/**
 * Liste volontairement bornée : la requête demande `limite + 1` lignes, on en
 * affiche `limite` et `autres` dit à l'écran qu'il en existe davantage — jamais
 * une liste tronquée présentée comme complète.
 */
export function borner<T>(lignes: T[] | null | undefined, limite: number): { lignes: T[]; autres: boolean } {
  const toutes = lignes ?? [];
  return { lignes: toutes.slice(0, limite), autres: toutes.length > limite };
}

// ---------------------------------------------------------------------------
// Listes de choix complètes (gp_options_chantiers, gp_options_employes,
// migration 20260930000404) : la lecture PostgREST triée par nom était tronquée
// à 1 000 lignes et évaluait la RLS de chaque ligne avant d'en rendre une.
// En cas d'erreur : liste vide (l'écran reste utilisable, sans choix faux).

export type OptionChantier = { id: string; nom: string; reference_interne: string | null; client_id: string; ville: string | null; statut: string };
export type OptionEmploye = { id: string; prenom: string; nom: string; poste: string | null; statut: string };

export async function lireOptionsChantiers(supabase: SupabaseClient, entrepriseId: string, options: { statutsExclus?: string[]; clientId?: string; tri?: "nom" | "recent" } = {}): Promise<OptionChantier[]> {
  const { data, error } = await supabase.rpc("gp_options_chantiers", {
    p_entreprise_id: entrepriseId, p_statuts_exclus: options.statutsExclus ?? ["archive", "annule"], p_client_id: options.clientId ?? null, p_tri: options.tri ?? "nom",
  });
  if (error) { console.error("[options] chantiers indisponibles", error.message); return []; }
  return (data ?? []) as OptionChantier[];
}

export async function lireOptionsEmployes(supabase: SupabaseClient, entrepriseId: string, options: { inclureNonActifs?: boolean } = {}): Promise<OptionEmploye[]> {
  const { data, error } = await supabase.rpc("gp_options_employes", { p_entreprise_id: entrepriseId, p_inclure_inactifs: options.inclureNonActifs ?? false });
  if (error) { console.error("[options] salariés indisponibles", error.message); return []; }
  return (data ?? []) as OptionEmploye[];
}

export type OptionClient = { id: string; nom: string | null; prenom: string | null; societe: string | null; email: string | null; statut: string | null };

export async function lireOptionsClients(supabase: SupabaseClient, entrepriseId: string, options: { statut?: string; statutExclu?: string; tri?: "recent" | "nom" | "societe" } = {}): Promise<OptionClient[]> {
  const { data, error } = await supabase.rpc("gp_options_clients", {
    p_entreprise_id: entrepriseId, p_statut: options.statut ?? null, p_statut_exclu: options.statutExclu ?? null, p_tri: options.tri ?? "recent",
  });
  if (error) { console.error("[options] clients indisponibles", error.message); return []; }
  return (data ?? []) as OptionClient[];
}
