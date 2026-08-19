export const AVENANT_STATUTS = [
  { cle: "brouillon", libelle: "Brouillon", couleur: "#8b8f96" },
  { cle: "envoye", libelle: "Envoyé", couleur: "#2c5a8c" },
  { cle: "accepte", libelle: "Accepté", couleur: "#3e7c5a" },
  { cle: "refuse", libelle: "Refusé", couleur: "#a64b45" },
  { cle: "annule", libelle: "Annulé", couleur: "#a64b45" },
] as const;

export function statutAvenant(cle: string) {
  return AVENANT_STATUTS.find((s) => s.cle === cle) ?? AVENANT_STATUTS[0];
}

// Un avenant accepté est terminal (immuable, DB-lock) : aucune transition au-delà.
export const TRANSITIONS_AVENANTS: Record<string, string[]> = {
  brouillon: ["envoye", "annule"],
  envoye: ["accepte", "refuse", "annule"],
  accepte: [],
  refuse: [],
  annule: [],
};

export function statutsAvenantAccessibles(statut: string) {
  const cles = new Set([statut, ...(TRANSITIONS_AVENANTS[statut] ?? [])]);
  return AVENANT_STATUTS.filter((item) => cles.has(item.cle));
}

export type LigneAvenant = {
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

// Totaux calculés côté client pour l'aperçu temps réel (le serveur recalcule et
// fait foi) — quantite peut être négative (ligne de moins-value), le calcul
// reste identique, le signe se propage naturellement.
export function calcTotauxAvenant(lignes: LigneAvenant[]) {
  let ht = 0;
  let tva = 0;
  for (const l of lignes) {
    const ligneHt = l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100);
    ht += ligneHt;
    tva += (ligneHt * l.taux_tva) / 100;
  }
  return { ht, tva, ttc: ht + tva };
}

// Numéro d'affichage dérivé, jamais stocké (aucun risque de divergence : le
// numéro du devis d'origine est figé dès son acceptation par DEVIS-LOCK-V1,
// condition requise pour qu'un avenant puisse même exister).
export function numeroAvenant(numeroDevis: string | null, ordre: number): string {
  return `${numeroDevis ?? "DEVIS"}-AV${String(ordre).padStart(2, "0")}`;
}

export function variationLabel(montantHt: number): string {
  const signe = montantHt >= 0 ? "+" : "";
  return `${signe}${new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(montantHt)}`;
}
