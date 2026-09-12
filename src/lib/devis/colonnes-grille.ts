/**
 * Colonnes de la grille de devis (GP V1, lot C) — module PUR.
 *
 * Une colonne SENSIBLE (coût, marge) n'existe que pour un utilisateur qui a `voir_couts_devis` :
 * elle n'est pas « masquée », elle est absente de la liste rendue. La modifiabilité suit les
 * droits (`gerer_couts_devis`, prix de vente, unité). Les réglages d'affichage d'un utilisateur
 * sont une commodité locale (localStorage), lus avec indulgence : un réglage inconnu est ignoré.
 */

export type DroitsGrille = { voirCouts: boolean; gererCouts: boolean; modifierPrix: boolean; modifierUnite: boolean; modifierRemise: boolean };

export type CleColonne =
  | "poignee" | "type" | "reference" | "designation" | "description" | "reference_fabricant" | "code_fournisseur"
  | "famille" | "fournisseur" | "quantite" | "unite" | "prix_achat" | "cout_mo" | "coefficient" | "marge" | "marge_pct"
  | "prix_vente" | "remise" | "tva" | "total_ht" | "commentaire_interne";

export type Colonne = {
  cle: CleColonne;
  libelle: string;
  /** En-tête abrégé de la grille. */
  court: string;
  largeurPx: number;
  alignement: "gauche" | "droite" | "centre";
  /** Colonne qui n'existe que si l'utilisateur voit les coûts. */
  sensible?: true;
  /** Droit nécessaire pour la modifier ; absent : toujours modifiable ; `false` : jamais (calculée). */
  modifiable?: keyof DroitsGrille | false;
  /** Visible sans réglage. */
  defaut: boolean;
  /** Ne peut pas être masquée. */
  obligatoire?: true;
};

export const COLONNES_GRILLE: readonly Colonne[] = [
  { cle: "poignee", libelle: "Sélection et déplacement", court: "", largeurPx: 44, alignement: "centre", modifiable: false, defaut: true, obligatoire: true },
  { cle: "type", libelle: "Type de ligne", court: "Type", largeurPx: 84, alignement: "gauche", defaut: true },
  { cle: "reference", libelle: "Référence interne", court: "Réf.", largeurPx: 110, alignement: "gauche", modifiable: false, defaut: true },
  { cle: "designation", libelle: "Désignation", court: "Désignation", largeurPx: 320, alignement: "gauche", defaut: true, obligatoire: true },
  { cle: "description", libelle: "Description", court: "Description", largeurPx: 220, alignement: "gauche", defaut: false },
  { cle: "reference_fabricant", libelle: "Référence fabricant", court: "Réf. fab.", largeurPx: 110, alignement: "gauche", modifiable: false, defaut: true },
  { cle: "code_fournisseur", libelle: "Code distributeur", court: "Code distrib.", largeurPx: 110, alignement: "gauche", modifiable: false, defaut: false },
  { cle: "famille", libelle: "Famille", court: "Famille", largeurPx: 130, alignement: "gauche", modifiable: false, defaut: false },
  { cle: "fournisseur", libelle: "Fournisseur", court: "Fourn.", largeurPx: 120, alignement: "gauche", modifiable: false, defaut: false },
  { cle: "quantite", libelle: "Quantité", court: "Qté", largeurPx: 80, alignement: "droite", defaut: true },
  { cle: "unite", libelle: "Unité", court: "U.", largeurPx: 64, alignement: "gauche", modifiable: "modifierUnite", defaut: true },
  { cle: "prix_achat", libelle: "Prix d’achat HT", court: "Achat HT", largeurPx: 96, alignement: "droite", sensible: true, modifiable: "gererCouts", defaut: true },
  { cle: "cout_mo", libelle: "Coût main-d’œuvre HT", court: "MO HT", largeurPx: 90, alignement: "droite", sensible: true, modifiable: "gererCouts", defaut: false },
  { cle: "coefficient", libelle: "Coefficient", court: "Coef.", largeurPx: 70, alignement: "droite", sensible: true, modifiable: "gererCouts", defaut: true },
  { cle: "marge", libelle: "Marge HT", court: "Marge €", largeurPx: 90, alignement: "droite", sensible: true, modifiable: false, defaut: true },
  { cle: "marge_pct", libelle: "Taux de marque", court: "Marge %", largeurPx: 76, alignement: "droite", sensible: true, modifiable: false, defaut: false },
  { cle: "prix_vente", libelle: "Prix de vente unitaire HT", court: "PU HT", largeurPx: 100, alignement: "droite", modifiable: "modifierPrix", defaut: true, obligatoire: true },
  { cle: "remise", libelle: "Remise de ligne (%)", court: "Rem. %", largeurPx: 70, alignement: "droite", modifiable: "modifierRemise", defaut: true },
  { cle: "tva", libelle: "TVA", court: "TVA", largeurPx: 70, alignement: "droite", defaut: true },
  { cle: "total_ht", libelle: "Total HT", court: "Total HT", largeurPx: 104, alignement: "droite", modifiable: false, defaut: true, obligatoire: true },
  { cle: "commentaire_interne", libelle: "Commentaire interne", court: "Comm. interne", largeurPx: 180, alignement: "gauche", defaut: false },
];

export type ReglagesColonnes = { visibles: readonly CleColonne[] };

export const CLE_STOCKAGE_COLONNES = "gp.devis.grille.colonnes.v1";

const CLES = new Set(COLONNES_GRILLE.map((c) => c.cle));

export function reglagesParDefaut(): ReglagesColonnes {
  return { visibles: COLONNES_GRILLE.filter((c) => c.defaut).map((c) => c.cle) };
}

/** Lit un réglage stocké (JSON ou objet) ; tout ce qui n'est pas une colonne connue est ignoré. */
export function lireReglagesColonnes(brut: unknown): ReglagesColonnes {
  let objet: unknown = brut;
  if (typeof brut === "string") {
    try { objet = JSON.parse(brut); } catch { return reglagesParDefaut(); }
  }
  const visibles = (objet as { visibles?: unknown } | null)?.visibles;
  if (!Array.isArray(visibles)) return reglagesParDefaut();
  const retenues = visibles.filter((v): v is CleColonne => typeof v === "string" && CLES.has(v as CleColonne));
  return { visibles: retenues };
}

/**
 * Colonnes à rendre, dans l'ordre canonique : obligatoires + visibles choisies, moins les sensibles
 * pour qui ne voit pas les coûts.
 */
export function colonnesVisibles(reglages: ReglagesColonnes, droits: Pick<DroitsGrille, "voirCouts">): Colonne[] {
  const choisies = new Set(reglages.visibles);
  return COLONNES_GRILLE.filter((c) => (c.obligatoire || choisies.has(c.cle)) && (!c.sensible || droits.voirCouts));
}

/** La cellule d'une colonne est-elle modifiable pour ces droits ? (le type de ligne s'applique ensuite) */
export function colonneModifiable(c: Colonne, droits: DroitsGrille): boolean {
  if (c.modifiable === false) return false;
  if (c.modifiable === undefined) return true;
  return droits[c.modifiable];
}

/** Colonnes proposées dans le réglage : jamais les obligatoires (toujours là) ni les sensibles interdites. */
export function colonnesReglables(droits: Pick<DroitsGrille, "voirCouts">): Colonne[] {
  return COLONNES_GRILLE.filter((c) => !c.obligatoire && (!c.sensible || droits.voirCouts));
}

export function basculerColonne(reglages: ReglagesColonnes, cle: CleColonne): ReglagesColonnes {
  const visibles = reglages.visibles.includes(cle) ? reglages.visibles.filter((c) => c !== cle) : [...reglages.visibles, cle];
  return { visibles };
}
