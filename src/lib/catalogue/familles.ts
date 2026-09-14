/**
 * Familles et sous-familles du catalogue — module PUR.
 *
 * La base fait foi (supabase/proposed/gp-v1-metier-bibliotheque.sql.proposed) : deux niveaux au plus,
 * nom unique sous un même parent sur la forme normalisée, parent de la même entreprise. Ce module
 * construit l'arbre et les libellés affichés, et prévient à l'écran les refus que la base opposerait.
 */
import { normaliser } from "@/lib/devis/recherche-articles";

export type Famille = {
  id: string;
  parentId: string | null;
  nom: string;
  ordre: number;
  actif: boolean;
};

export const LONGUEUR_MAX_FAMILLE = 120;

/** Séparateur du libellé — identique à `libelle_famille` en SQL (U+203A). */
export const SEPARATEUR_FAMILLE = " › ";

const comparer = (a: Famille, b: Famille) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr");

export function libelleFamille(famille: Famille, parId: ReadonlyMap<string, Famille>): string {
  const parent = famille.parentId ? parId.get(famille.parentId) : undefined;
  return parent ? `${parent.nom}${SEPARATEUR_FAMILLE}${famille.nom}` : famille.nom;
}

export type BrancheFamille = { famille: Famille; sousFamilles: Famille[] };

/** Arbre trié (ordre, puis nom). Une sous-famille dont le parent est absent remonte au premier niveau. */
export function arbreFamilles(familles: readonly Famille[]): BrancheFamille[] {
  const parId = new Map(familles.map((f) => [f.id, f]));
  const racines = familles.filter((f) => !f.parentId || !parId.has(f.parentId)).sort(comparer);
  return racines.map((famille) => ({
    famille,
    sousFamilles: familles.filter((f) => f.parentId === famille.id).sort(comparer),
  }));
}

export type OptionFamille = { id: string; libelle: string; niveau: 0 | 1; actif: boolean };

/**
 * Options d'un sélecteur de famille, dans l'ordre de l'arbre. Les familles archivées sont omises,
 * sauf celle déjà choisie (on ne fait jamais disparaître une valeur enregistrée).
 */
export function optionsFamilles(familles: readonly Famille[], selectionneeId: string | null = null): OptionFamille[] {
  const parId = new Map(familles.map((f) => [f.id, f]));
  const garder = (f: Famille) => f.actif || f.id === selectionneeId;
  const options: OptionFamille[] = [];
  for (const { famille, sousFamilles } of arbreFamilles(familles)) {
    if (garder(famille)) options.push({ id: famille.id, libelle: famille.nom, niveau: 0, actif: famille.actif });
    for (const s of sousFamilles) {
      if (garder(s)) options.push({ id: s.id, libelle: libelleFamille(s, parId), niveau: 1, actif: s.actif });
    }
  }
  return options;
}

export function validerNomFamille(nom: string | null | undefined): { ok: true; valeur: string } | { ok: false; erreur: string } {
  const net = (nom ?? "").trim();
  if (!net) return { ok: false, erreur: "Le nom de la famille est obligatoire." };
  if (Array.from(net).length > LONGUEUR_MAX_FAMILLE) {
    return { ok: false, erreur: `Le nom dépasse ${LONGUEUR_MAX_FAMILLE} caractères.` };
  }
  return { ok: true, valeur: net };
}

/**
 * Motif de refus si `nom` ne peut pas être rangé sous `parentId` (famille `familleId` en cours de
 * modification, `null` à la création) ; `null` si c'est permis. Mêmes règles que la base.
 */
export function refusRangement(
  familles: readonly Famille[],
  nom: string,
  parentId: string | null,
  familleId: string | null = null,
): string | null {
  const parId = new Map(familles.map((f) => [f.id, f]));
  if (parentId) {
    const parent = parId.get(parentId);
    if (!parent) return "Famille parente introuvable.";
    if (parentId === familleId) return "Une famille ne peut pas être sa propre sous-famille.";
    if (parent.parentId) return "Deux niveaux au plus : une famille, puis ses sous-familles.";
    if (familleId && familles.some((f) => f.parentId === familleId)) {
      return "Cette famille a des sous-familles : elle ne peut pas devenir elle-même une sous-famille.";
    }
  }
  const cle = normaliser(nom);
  const doublon = familles.some((f) => f.id !== familleId && (f.parentId ?? null) === parentId && normaliser(f.nom) === cle);
  return doublon ? "Une famille de ce nom existe déjà à cet endroit." : null;
}
