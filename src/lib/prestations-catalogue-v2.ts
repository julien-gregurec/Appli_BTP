/**
 * Fiche prestation du catalogue — champs du moteur de devis v2. Module PUR.
 *
 * Trois références DISTINCTES (interne, fabricant, code-barres) : chacune est lue de son propre
 * champ, aucune n'est jamais recopiée dans une autre ni fusionnée. Valeurs rognées, vide → `null`,
 * longueurs bornées comme la contrainte SQL proposée (120, code-barres 64, notes 2 000).
 *
 * GP V1 (lot B) : famille (la catégorie texte en devient le libellé dérivé, calculé par la base),
 * notes internes, coefficient et mode de prix.
 */

import { normaliser } from "@/lib/devis/recherche-articles";
import type { Famille } from "@/lib/catalogue/familles";
import type { ModePrix } from "@/lib/catalogue/prix-article";

export type ChampsCatalogueV2 = {
  reference_interne: string | null;
  reference_fabricant: string | null;
  code_barres: string | null;
  fabricant: string | null;
  fournisseur_id: string | null;
  /** Catégorie texte historique : conservée tant qu'aucune famille n'est choisie. */
  categorie: string | null;
  famille_id: string | null;
  notes_internes: string | null;
};

export type FournisseurOption = { id: string; nom: string; reference: string | null; actif: boolean };

/** Ce que la page passe au formulaire quand le moteur v2 est actif. */
export type OptionsCatalogueV2 = {
  fournisseurs: FournisseurOption[];
  familles: Famille[];
  /** `absent` : ni champ ni valeur ; `lecture` : valeur affichée ; `edition` : champ modifiable. */
  cout: "absent" | "lecture" | "edition";
  /** Toujours `null` en mode `absent`. */
  prixAchatHt: number | null;
  /** Toujours `null` en mode `absent`. */
  coefficient: number | null;
  /** Toujours `saisi` en mode `absent` (l'information n'est pas révélée). */
  modePrix: ModePrix;
};

export const LONGUEURS_MAX_CATALOGUE = {
  reference_interne: 120,
  reference_fabricant: 120,
  code_barres: 64,
  fabricant: 120,
  categorie: 120,
  notes_internes: 2000,
} as const;

/** Sujet et verbe accordé du message de dépassement. */
const LIBELLES: Record<keyof typeof LONGUEURS_MAX_CATALOGUE, string> = {
  reference_interne: "La référence interne dépasse",
  reference_fabricant: "La référence fabricant dépasse",
  code_barres: "Le code-barres dépasse",
  fabricant: "Le fabricant dépasse",
  categorie: "La catégorie dépasse",
  notes_internes: "Les notes internes dépassent",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Longueur en caractères, comme `length()` en SQL (et non en unités UTF-16). */
const longueur = (s: string) => Array.from(s).length;

/**
 * Lit les champs v2 d'un formulaire (`lire = (nom) => formData.get(nom)`).
 * Rend une erreur lisible plutôt que de tronquer une saisie.
 */
export function lireChampsCatalogueV2(lire: (nom: string) => unknown): { valeurs: ChampsCatalogueV2 } | { erreur: string } {
  const valeurs = {} as Record<keyof typeof LONGUEURS_MAX_CATALOGUE, string | null>;
  for (const nom of Object.keys(LONGUEURS_MAX_CATALOGUE) as Array<keyof typeof LONGUEURS_MAX_CATALOGUE>) {
    const v = texte(lire(nom));
    if (longueur(v) > LONGUEURS_MAX_CATALOGUE[nom]) {
      return { erreur: `${LIBELLES[nom]} ${LONGUEURS_MAX_CATALOGUE[nom]} caractères.` };
    }
    valeurs[nom] = v || null;
  }
  const fournisseur = texte(lire("fournisseur_id"));
  if (fournisseur && !UUID.test(fournisseur)) return { erreur: "Fournisseur invalide." };
  const famille = texte(lire("famille_id"));
  if (famille && !UUID.test(famille)) return { erreur: "Famille invalide." };
  return { valeurs: { ...valeurs, fournisseur_id: fournisseur || null, famille_id: famille || null } };
}

/** Plafond de `numeric(12, 4)`. */
const PRIX_MAX = 99_999_999.9999;

/**
 * Prix d'achat HT saisi. Vide → `null` : AUCUNE écriture (la table des coûts n'accorde pas la
 * suppression ; un prix enregistré ne s'efface pas par un champ vidé).
 */
export function lirePrixAchat(v: unknown): { valeur: number | null } | { erreur: string } {
  const s = texte(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return { valeur: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { erreur: "Prix d’achat invalide." };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > PRIX_MAX) return { erreur: "Prix d’achat invalide." };
  return { valeur: Math.round(n * 10000) / 10000 };
}

export type LigneCatalogueRecherche = {
  referenceInterne: string | null;
  referenceFabricant: string | null;
  designation: string;
  fabricant: string | null;
  /** Code chez le distributeur principal (lot B). */
  codeFournisseur?: string | null;
  /** Libellé de famille (lot B). */
  famille?: string | null;
};

/**
 * Recherche côté écran dans le catalogue : références, code distributeur, désignation, fabricant et
 * famille, comparés par `normaliser()` (casse, accents, espaces et séparateurs ignorés). Correspond si
 * la recherche entière apparaît dans un champ, ou si chacun de ses mots apparaît dans l'un des champs.
 */
export function correspondRecherche(l: LigneCatalogueRecherche, recherche: string): boolean {
  const entiere = normaliser(recherche);
  if (!entiere) return true;
  const champs = [l.referenceInterne, l.referenceFabricant, l.codeFournisseur, l.designation, l.fabricant, l.famille]
    .map(normaliser).filter(Boolean);
  if (champs.some((c) => c.includes(entiere))) return true;
  const mots = recherche.split(/\s+/).map(normaliser).filter(Boolean);
  return mots.length > 1 && mots.every((m) => champs.some((c) => c.includes(m)));
}
