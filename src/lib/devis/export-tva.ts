/**
 * Ventilation de la TVA collectée pour l'export comptable — module PUR.
 *
 * L'export historique recalculait la TVA ligne par ligne, en flottants, sans arrondi et sans remise
 * globale. Or une facture issue d'un devis porte désormais la remise globale du devis : sans elle,
 * la base HT exportée dépasserait le HT de la facture. Ici, chaque facture est ventilée par
 * `totauxDocument` — le même calcul que la base — avec sa remise globale, et les bases et TVA par
 * taux retombent EXACTEMENT sur les totaux enregistrés de la facture.
 */

import { totauxDocument } from "@/lib/devis/montants";

export type LigneFactureTva = {
  numero: string;
  date: string;
  quantite: number;
  prixUnitaireHt: number;
  remiseLignePct: number;
  tauxTva: number;
  remiseGlobalePct: number;
};

export type DetailTva = { date: string; numero: string; taux: number; ht: number; tva: number };

export function ventilationTvaFactures(lignes: readonly LigneFactureTva[]): DetailTva[] {
  const parFacture = new Map<string, LigneFactureTva[]>();
  for (const l of lignes) parFacture.set(l.numero, [...(parFacture.get(l.numero) ?? []), l]);

  const details: DetailTva[] = [];
  for (const [numero, lignesFacture] of parFacture) {
    const t = totauxDocument(
      lignesFacture.map((l) => ({ quantite: l.quantite, prixUnitaireHt: l.prixUnitaireHt, remiseLignePct: l.remiseLignePct, tauxTva: l.tauxTva })),
      lignesFacture[0].remiseGlobalePct,
    );
    for (const v of t.ventilation) details.push({ date: lignesFacture[0].date, numero, taux: v.tauxTva, ht: v.baseHt, tva: v.montantTva });
  }
  return details.sort((a, b) => a.date.localeCompare(b.date) || a.numero.localeCompare(b.numero) || a.taux - b.taux);
}
