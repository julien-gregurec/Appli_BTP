/**
 * Catalogue des devis et lignes de devis v2 TELS QUE LUS EN BASE — module PUR.
 *
 * Partagé par l'import du catalogue (src/app/actions/import.ts) et par les exports CSV
 * (src/app/api/exports/catalogue, src/app/api/devis/[id]/lignes). N'est employé que moteur v2
 * actif : les colonnes listées ici n'existent pas dans le schéma tant que le SQL proposé
 * (supabase/proposed/gp-devis-wysiwyg-catalogue-ouvrages-v1.sql.proposed) n'est pas appliqué.
 *
 * ── Tout lire, ou rien ───────────────────────────────────────────────────────────────────
 * PostgREST plafonne chaque réponse (`max_rows`) SANS le signaler. Un catalogue de 1 500 articles
 * lu d'une traite en perdrait 500 : l'import les croirait absents et les recréerait en double,
 * l'export les omettrait. `chargerParPages` lit donc page après page, avance du nombre de lignes
 * RÉELLEMENT reçues (et non de la taille demandée, que le plafond peut rogner) et ne s'arrête que
 * sur une page vide. Au-delà d'un plafond de pages, il échoue plutôt que de rendre une liste
 * tronquée.
 */

import type { ArticleExistant, FournisseurConnu } from "@/lib/devis/import-catalogue";

/** Colonnes de `prestations_catalogue` lues par l'import et l'export. Jamais de prix d'achat ici. */
export const COLONNES_PRESTATIONS_V2 = [
  "id", "designation", "description", "unite", "prix_unitaire_ht", "taux_tva", "actif",
  "reference_interne", "reference_fabricant", "code_barres", "fabricant", "fournisseur_id", "categorie",
].join(",");

/**
 * Colonnes de `lignes_devis` et `devis_ouvrages` attendues par `etatDepuisBase`. Même liste que
 * `src/lib/devis/editeur-v2-serveur.ts`, qui ne l'exporte pas : à tenir alignées.
 */
export const COLONNES_LIGNES_DEVIS_V2 = [
  "cle_ligne", "ouvrage_cle", "ordre", "designation", "description", "type", "quantite", "unite", "prix_unitaire_ht",
  "remise_ligne", "taux_tva", "origine_ligne", "source_catalogue", "source_id", "reference_interne_instantane",
  "reference_fabricant_instantane", "nature", "parametres_quantite", "quantite_forcee", "visible_client",
  "afficher_quantite", "afficher_prix", "description_client_personnalisee", "motif_ajustement", "detail_calcul",
].join(",");

export const COLONNES_OUVRAGES_DEVIS_V2 = [
  "cle", "ordre", "ouvrage_id", "ouvrage_version", "ouvrage_reference", "ouvrage_nom", "categorie", "unite_principale",
  "quantite_principale", "options", "saisies", "libelle_client", "description_client", "mode_presentation",
  "instantane_modele", "modifications_manuelles",
].join(",");

export type PrestationBase = {
  id: string;
  designation: string;
  description: string | null;
  unite: string;
  prix_unitaire_ht: number | string;
  taux_tva: number | string | null;
  actif: boolean | null;
  reference_interne: string | null;
  reference_fabricant: string | null;
  code_barres: string | null;
  fabricant: string | null;
  fournisseur_id: string | null;
  categorie: string | null;
};

export type FournisseurBase = { id: string; nom: string; reference: string | null };

/** Ligne de `prestations_catalogue_couts` — lue SEULEMENT avec `voir_couts_devis`. */
export type CoutPrestationBase = { prestation_id: string; prix_achat_ht: number | string | null };

function nombre(x: number | string | null | undefined): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Article du catalogue au format du planificateur et de l'export. `prixAchatHt` est fourni par
 * l'appelant, qui seul sait si l'utilisateur a le droit de le voir : `null` sinon.
 */
export function articleDepuisBase(p: PrestationBase, prixAchatHt: number | null): ArticleExistant {
  return {
    id: p.id,
    referenceInterne: p.reference_interne ?? null,
    referenceFabricant: p.reference_fabricant ?? null,
    codeBarres: p.code_barres ?? null,
    designation: p.designation,
    description: p.description ?? null,
    fabricant: p.fabricant ?? null,
    fournisseurId: p.fournisseur_id ?? null,
    unite: p.unite,
    prixAchatHt,
    prixVenteHt: nombre(p.prix_unitaire_ht) ?? 0,
    tauxTva: nombre(p.taux_tva),
    categorie: p.categorie ?? null,
    actif: p.actif !== false,
  };
}

export function fournisseurDepuisBase(f: FournisseurBase): FournisseurConnu {
  return { id: f.id, nom: f.nom, reference: f.reference ?? "" };
}

/** Prix d'achat par prestation ; une valeur illisible est écartée, jamais convertie en zéro. */
export function coutsParPrestation(couts: readonly CoutPrestationBase[]): Map<string, number> {
  const parId = new Map<string, number>();
  for (const c of couts) {
    const n = nombre(c.prix_achat_ht);
    if (n !== null) parId.set(c.prestation_id, n);
  }
  return parId;
}

/** Catalogue au format du planificateur, prix d'achat compris seulement si `voirCouts`. */
export function articlesDepuisBase(
  prestations: readonly PrestationBase[],
  couts: readonly CoutPrestationBase[],
  o: { voirCouts: boolean },
): ArticleExistant[] {
  const prix = o.voirCouts ? coutsParPrestation(couts) : new Map<string, number>();
  return prestations.map((p) => articleDepuisBase(p, o.voirCouts ? (prix.get(p.id) ?? null) : null));
}

export const TAILLE_PAGE = 1000;
export const PAGES_MAX = 200;

/** Une requête PostgREST paginée : `de` et `a` inclus, comme `.range(de, a)`. */
export type LecturePage = (de: number, a: number) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * Lit toutes les lignes d'une requête, page après page. La requête DOIT être triée sur une clé
 * unique (sinon deux pages peuvent se recouvrir ou s'ignorer). `erreur` non nulle : rien n'est rendu.
 */
export async function chargerParPages<T>(
  page: LecturePage,
  o: { taille?: number; pagesMax?: number } = {},
): Promise<{ data: T[]; erreur: unknown }> {
  const taille = o.taille ?? TAILLE_PAGE;
  const pagesMax = o.pagesMax ?? PAGES_MAX;
  const data: T[] = [];
  for (let n = 0; n < pagesMax; n++) {
    const reponse = await page(data.length, data.length + taille - 1);
    if (reponse.error) return { data: [], erreur: reponse.error };
    const lot = Array.isArray(reponse.data) ? (reponse.data as T[]) : [];
    if (lot.length === 0) return { data, erreur: null };
    for (const ligne of lot) data.push(ligne);
  }
  return { data: [], erreur: new Error(`Lecture interrompue au-delà de ${pagesMax} pages de ${taille} lignes, plutôt que tronquée.`) };
}
