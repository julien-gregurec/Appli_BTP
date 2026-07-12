export const FACTURE_STATUTS = [
  { cle: "brouillon", libelle: "Brouillon", couleur: "#8b8f96" },
  { cle: "envoyee", libelle: "Envoyée", couleur: "#2c5a8c" },
  { cle: "payee_partiel", libelle: "Partiellement payée", couleur: "#b8792e" },
  { cle: "payee", libelle: "Payée", couleur: "#2f6b47" },
  { cle: "en_retard", libelle: "En retard", couleur: "#a64b45" },
  { cle: "annulee", libelle: "Annulée", couleur: "#a64b45" },
  { cle: "avoir_emis", libelle: "Avoir émis", couleur: "#6b4e8c" },
] as const;

export function statutFacture(cle: string) {
  return FACTURE_STATUTS.find((s) => s.cle === cle) ?? FACTURE_STATUTS[0];
}

export const TRANSITIONS_FACTURES: Record<string, string[]> = {
  brouillon: ["envoyee", "annulee"],
  envoyee: ["en_retard", "annulee"],
  en_retard: ["envoyee", "annulee"],
  payee_partiel: [],
  payee: [],
  annulee: [],
  avoir_emis: [],
};

export function statutsFactureAccessibles(statut: string) {
  const cles = new Set([statut, ...(TRANSITIONS_FACTURES[statut] ?? [])]);
  return FACTURE_STATUTS.filter((item) => cles.has(item.cle));
}

export const FACTURE_TYPES = [
  { cle: "simple", libelle: "Simple" },
  { cle: "acompte", libelle: "Acompte" },
  { cle: "situation", libelle: "Situation" },
  { cle: "finale", libelle: "Finale" },
  { cle: "avoir", libelle: "Avoir" },
] as const;

export const MODES_PAIEMENT = [
  { cle: "virement", libelle: "Virement" },
  { cle: "cheque", libelle: "Chèque" },
  { cle: "especes", libelle: "Espèces" },
  { cle: "cb", libelle: "Carte bancaire" },
  { cle: "carte_en_ligne", libelle: "Paiement en ligne" },
] as const;

export function typeFactureLabel(cle: string) {
  return FACTURE_TYPES.find((t) => t.cle === cle)?.libelle ?? cle;
}
