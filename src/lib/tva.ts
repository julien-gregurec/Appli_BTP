export const TAUX_TVA_FRANCE = [0, 2.1, 5.5, 10, 20] as const;

export type TauxTvaFrance = (typeof TAUX_TVA_FRANCE)[number];

const arrondirCentimes = (valeur: number) => Math.round((valeur + Number.EPSILON) * 100) / 100;

export function estTauxTvaFrance(valeur: number): valeur is TauxTvaFrance {
  return TAUX_TVA_FRANCE.some((taux) => taux === valeur);
}

export function calculerMontantsTva(montantHt: number, tauxTva: number) {
  if (!Number.isFinite(montantHt) || montantHt < 0) throw new Error("Montant HT invalide");
  if (!estTauxTvaFrance(tauxTva)) throw new Error("Taux de TVA français invalide");

  const ht = arrondirCentimes(montantHt);
  const tva = arrondirCentimes(ht * tauxTva / 100);
  return { ht, tva, ttc: arrondirCentimes(ht + tva), taux: tauxTva };
}

