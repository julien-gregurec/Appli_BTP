export const DEVIS_STATUTS = [
  { cle: "brouillon", libelle: "Brouillon", couleur: "#8b8f96" },
  { cle: "envoye", libelle: "Envoyé", couleur: "#2c5a8c" },
  { cle: "accepte", libelle: "Accepté", couleur: "#3e7c5a" },
  { cle: "refuse", libelle: "Refusé", couleur: "#a64b45" },
  { cle: "expire", libelle: "Expiré", couleur: "#b8792e" },
  { cle: "annule", libelle: "Annulé", couleur: "#a64b45" },
] as const;

export function statutDevis(cle: string) {
  return DEVIS_STATUTS.find((s) => s.cle === cle) ?? DEVIS_STATUTS[0];
}

export const TRANSITIONS_DEVIS: Record<string, string[]> = {
  brouillon: ["envoye", "annule"],
  envoye: ["accepte", "refuse", "expire", "annule"],
  refuse: ["envoye", "annule"],
  expire: ["envoye", "annule"],
  accepte: [],
  annule: [],
};

export function statutsDevisAccessibles(statut: string) {
  const cles = new Set([statut, ...(TRANSITIONS_DEVIS[statut] ?? [])]);
  return DEVIS_STATUTS.filter((item) => cles.has(item.cle));
}

export const LIGNE_TYPES = [
  { cle: "main_oeuvre", libelle: "Main-d'œuvre" },
  { cle: "fourniture", libelle: "Fourniture" },
  { cle: "sous_traitance", libelle: "Sous-traitance" },
  { cle: "deplacement", libelle: "Déplacement" },
  { cle: "forfait", libelle: "Forfait" },
] as const;

export const UNITES = ["u", "m²", "ml", "h", "forfait", "kg", "L"] as const;

export const TAUX_TVA = [20, 10, 5.5, 0] as const;

export function euros(n: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

export type LigneDevis = {
  id?: string;
  designation: string;
  description: string | null;
  type: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  remise_ligne: number;
  taux_tva: number;
};

// Totaux calculés côté client pour l'aperçu temps réel (le serveur recalcule et fait foi).
export function calcTotaux(lignes: LigneDevis[], remiseGlobale: number) {
  let ht = 0;
  let tva = 0;
  for (const l of lignes) {
    const ligneHt = l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100);
    ht += ligneHt;
    tva += (ligneHt * l.taux_tva) / 100;
  }
  const facteur = 1 - remiseGlobale / 100;
  ht *= facteur;
  tva *= facteur;
  return { ht, tva, ttc: ht + tva };
}
