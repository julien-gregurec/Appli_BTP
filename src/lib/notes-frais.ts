export const CATEGORIES_FRAIS = [
  "Repas", "Carburant", "Péage", "Stationnement", "Hôtel", "Transport",
  "Petit matériel", "Fournitures", "Outillage", "Achat chantier", "Autre",
] as const;

export const TYPES_JUSTIFICATIF = [
  { cle: "facture", libelle: "Facture" },
  { cle: "ticket_caisse", libelle: "Ticket de caisse" },
  { cle: "recu_paiement", libelle: "Reçu de paiement" },
  { cle: "recu_carte_bancaire", libelle: "Reçu de carte bancaire" },
  { cle: "facture_electronique_originale", libelle: "Facture électronique originale" },
  { cle: "autre_justificatif", libelle: "Autre justificatif" },
] as const;

export const NOTE_FRAIS_STATUTS = [
  { cle: "brouillon", libelle: "Brouillon", couleur: "#64748b" },
  { cle: "a_completer", libelle: "À compléter", couleur: "#d97706" },
  { cle: "soumis", libelle: "Soumis", couleur: "#2563eb" },
  { cle: "en_verification", libelle: "En cours de vérification", couleur: "#7c3aed" },
  { cle: "correction_demandee", libelle: "Correction demandée", couleur: "#ea580c" },
  { cle: "valide", libelle: "Validé", couleur: "#15803d" },
  { cle: "refuse", libelle: "Refusé", couleur: "#b91c1c" },
  { cle: "exporte_comptabilite", libelle: "Exporté en comptabilité", couleur: "#0369a1" },
  { cle: "verrouille", libelle: "Verrouillé", couleur: "#111827" },
  { cle: "archive", libelle: "Archivé", couleur: "#475569" },
] as const;

const LEGACY: Record<string, string> = {
  soumise: "soumis",
  validee: "valide",
  remboursee: "valide",
  refusee: "refuse",
};

export function statutNoteFrais(cle: string) {
  const normalise = LEGACY[cle] ?? cle;
  return NOTE_FRAIS_STATUTS.find((s) => s.cle === normalise) ?? NOTE_FRAIS_STATUTS[0];
}

export function noteModifiable(statut: string) {
  return ["brouillon", "a_completer", "correction_demandee"].includes(statut);
}
