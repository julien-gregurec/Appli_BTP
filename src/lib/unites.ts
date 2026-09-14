/**
 * Unités métier proposées dans les devis, factures, commandes et le catalogue (GP V1).
 *
 * Liste ouverte : l'unité est stockée en texte libre (`lignes_devis.unite`…), une unité hors liste reste
 * acceptée et conservée telle quelle (unité personnalisée). Les clés reprennent les valeurs historiques
 * (`u`, `m²`, `ml`, `h`, `forfait`, `kg`, `L`) pour ne rien casser dans les données existantes.
 */
export type UniteMetier = { cle: string; libelle: string; groupe: "quantite" | "longueur" | "surface" | "volume" | "masse" | "temps" | "conditionnement" | "forfait" };

export const UNITES_METIER: ReadonlyArray<UniteMetier> = [
  { cle: "u", libelle: "unité", groupe: "quantite" },
  { cle: "pce", libelle: "pièce", groupe: "quantite" },
  { cle: "paire", libelle: "paire", groupe: "quantite" },
  { cle: "ensemble", libelle: "ensemble", groupe: "quantite" },
  { cle: "lot", libelle: "lot", groupe: "quantite" },
  { cle: "m", libelle: "mètre", groupe: "longueur" },
  { cle: "ml", libelle: "mètre linéaire", groupe: "longueur" },
  { cle: "m²", libelle: "mètre carré", groupe: "surface" },
  { cle: "m³", libelle: "mètre cube", groupe: "volume" },
  { cle: "L", libelle: "litre", groupe: "volume" },
  { cle: "kg", libelle: "kilogramme", groupe: "masse" },
  { cle: "g", libelle: "gramme", groupe: "masse" },
  { cle: "t", libelle: "tonne", groupe: "masse" },
  { cle: "h", libelle: "heure", groupe: "temps" },
  { cle: "jour", libelle: "jour", groupe: "temps" },
  { cle: "forfait", libelle: "forfait", groupe: "forfait" },
  { cle: "boîte", libelle: "boîte", groupe: "conditionnement" },
  { cle: "rouleau", libelle: "rouleau", groupe: "conditionnement" },
  { cle: "palette", libelle: "palette", groupe: "conditionnement" },
  { cle: "sac", libelle: "sac", groupe: "conditionnement" },
  { cle: "plaque", libelle: "plaque", groupe: "conditionnement" },
  { cle: "panneau", libelle: "panneau", groupe: "conditionnement" },
];

/** Clés seules (liste historique étendue), dans l'ordre d'affichage. */
export const UNITES_CLES: ReadonlyArray<string> = UNITES_METIER.map((u) => u.cle);

/** Libellé long d'une unité connue ; une unité personnalisée est rendue telle quelle. */
export function libelleUnite(cle: string): string {
  return UNITES_METIER.find((u) => u.cle === cle)?.libelle ?? cle;
}
