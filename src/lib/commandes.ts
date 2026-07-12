export const COMMANDE_STATUTS = [
  { cle: "brouillon", libelle: "Brouillon", couleur: "#8b8f96" },
  { cle: "envoyee", libelle: "Envoyée", couleur: "#2c5a8c" },
  { cle: "confirmee", libelle: "Confirmée", couleur: "#b8792e" },
  { cle: "recue_partiel", libelle: "Reçue partiellement", couleur: "#b8792e" },
  { cle: "recue", libelle: "Reçue", couleur: "#2f6b47" },
  { cle: "annulee", libelle: "Annulée", couleur: "#a64b45" },
] as const;

export function statutCommande(cle: string) {
  return COMMANDE_STATUTS.find((s) => s.cle === cle) ?? COMMANDE_STATUTS[0];
}

// Transitions autorisées entre statuts d'une commande.
export const TRANSITIONS_COMMANDES: Record<string, string[]> = {
  brouillon: ["envoyee", "annulee"],
  envoyee: ["confirmee", "recue", "annulee"],
  confirmee: ["recue", "annulee"],
  recue_partiel: ["recue", "annulee"],
  recue: [],
  annulee: [],
};

export function statutsCommandeAccessibles(statut: string) {
  const cles = new Set([statut, ...(TRANSITIONS_COMMANDES[statut] ?? [])]);
  return COMMANDE_STATUTS.filter((item) => cles.has(item.cle));
}

export type LigneCommande = {
  designation: string;
  description: string | null;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  taux_tva: number;
};

export function totauxCommande(lignes: LigneCommande[]) {
  let ht = 0;
  let tva = 0;
  for (const l of lignes) {
    const ligneHt = l.quantite * l.prix_unitaire_ht;
    ht += ligneHt;
    tva += ligneHt * (l.taux_tva / 100);
  }
  return { ht, tva, ttc: ht + tva };
}
