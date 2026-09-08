/**
 * Tris proposés sur la liste d'inventaire Colors.
 *
 * Le tri est appliqué par la base (colonne + index dédiés), jamais en
 * reconstituant la liste côté navigateur : l'inventaire d'un dépôt bien rempli
 * dépasse largement une page.
 */
export type TriInventaire = "recent" | "ajout_recent" | "ajout_ancien" | "nom";

/** Le tri historique de l'écran : la dernière activité en tête. Inchangé par défaut. */
export const TRI_PAR_DEFAUT: TriInventaire = "recent";
export const TAILLE_PAGE_INVENTAIRE = 60;

export const TRIS: ReadonlyArray<{ valeur: TriInventaire; libelle: string }> = [
  { valeur: "recent", libelle: "Dernière modification" },
  { valeur: "ajout_recent", libelle: "Ajout le plus récent" },
  { valeur: "ajout_ancien", libelle: "Ajout le plus ancien" },
  { valeur: "nom", libelle: "Marque et produit (A → Z)" },
];

type ColonneTri = { colonne: string; ascendant: boolean };

const ORDRES: Record<TriInventaire, ColonneTri[]> = {
  recent: [{ colonne: "updated_at", ascendant: false }, { colonne: "id", ascendant: false }],
  ajout_recent: [{ colonne: "created_at", ascendant: false }, { colonne: "id", ascendant: false }],
  ajout_ancien: [{ colonne: "created_at", ascendant: true }, { colonne: "id", ascendant: true }],
  nom: [{ colonne: "marque", ascendant: true }, { colonne: "produit", ascendant: true }],
};

/** Normalise le paramètre d'URL en tri connu. */
export function lireTri(valeur: unknown): TriInventaire {
  return TRIS.some((t) => t.valeur === valeur) ? (valeur as TriInventaire) : TRI_PAR_DEFAUT;
}

/** Colonnes d'ordre à appliquer côté base pour le tri demandé. */
export function colonnesTri(tri: TriInventaire): ColonneTri[] {
  return ORDRES[tri];
}

/** Numéro de page (1-based) reçu par l'URL, borné pour rester exploitable. */
export function lirePage(valeur: unknown): number {
  const page = Number.parseInt(String(valeur ?? "1"), 10);
  return Number.isFinite(page) && page >= 1 && page <= 200 ? page : 1;
}

/** Fenêtre `[debut, fin]` à demander à la base pour cette page. */
export function fenetrePage(page: number, taille = TAILLE_PAGE_INVENTAIRE): { debut: number; fin: number } {
  const debut = (page - 1) * taille;
  return { debut, fin: debut + taille - 1 };
}
