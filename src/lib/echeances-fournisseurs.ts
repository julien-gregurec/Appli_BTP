export const DELAIS_PAIEMENT_FOURNISSEUR = [0, 30, 45, 60, 90] as const;

export type DelaiPaiementFournisseur = (typeof DELAIS_PAIEMENT_FOURNISSEUR)[number];

export function delaiPaiementFournisseurValide(valeur: number): valeur is DelaiPaiementFournisseur {
  return DELAIS_PAIEMENT_FOURNISSEUR.includes(valeur as DelaiPaiementFournisseur);
}

export function libelleDelaiPaiementFournisseur(delai: number) {
  return delai === 0 ? "Paiement immédiat" : `${delai} jours`;
}

export function calculerEcheanceFournisseur(datePiece: string, delai: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePiece) || !delaiPaiementFournisseurValide(delai)) return "";
  const date = new Date(`${datePiece}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + delai);
  return date.toISOString().slice(0, 10);
}

export function etatEcheanceFournisseur(dateEcheance: string | null, maintenant = new Date()) {
  if (!dateEcheance) return null;
  const echeance = new Date(`${dateEcheance}T00:00:00Z`);
  if (Number.isNaN(echeance.getTime())) return null;
  const aujourdHui = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  const jours = Math.round((echeance.getTime() - aujourdHui.getTime()) / 86_400_000);
  if (jours < 0) return { niveau: "retard" as const, jours, libelle: `En retard de ${Math.abs(jours)} j` };
  if (jours === 0) return { niveau: "urgent" as const, jours, libelle: "À payer aujourd’hui" };
  if (jours <= 7) return { niveau: "proche" as const, jours, libelle: `À payer dans ${jours} j` };
  return { niveau: "normal" as const, jours, libelle: `Échéance dans ${jours} j` };
}
