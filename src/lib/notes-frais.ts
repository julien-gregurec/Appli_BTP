export const CATEGORIES_FRAIS = [
  "Carburant",
  "Péage / parking",
  "Repas",
  "Hébergement",
  "Fournitures",
  "Petit outillage",
  "Transport",
  "Autre",
] as const;

export const NOTE_FRAIS_STATUTS = [
  { cle: "soumise", libelle: "Soumise", couleur: "#2c5a8c" },
  { cle: "validee", libelle: "Validée", couleur: "#b8792e" },
  { cle: "remboursee", libelle: "Remboursée", couleur: "#2f6b47" },
  { cle: "refusee", libelle: "Refusée", couleur: "#a64b45" },
] as const;

export function statutNoteFrais(cle: string) {
  return NOTE_FRAIS_STATUTS.find((s) => s.cle === cle) ?? NOTE_FRAIS_STATUTS[0];
}
