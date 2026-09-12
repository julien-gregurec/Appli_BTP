/**
 * Rentabilité d'une ligne chiffrée de devis (GP V1) — module PUR, décimal exact.
 *
 * Coût de la ligne = (prix d'achat + main-d'œuvre) × quantité ; marge = vente HT − coût ; taux de
 * marque = marge / vente. Sans coût connu (ou non visible), aucun indicateur n'est reconstitué.
 */
import { arrondir, dec, diviserArrondi, estNul, montantLigneHtExact, mul, sub, versNombre, type LigneMontant } from "@/lib/devis/montants";

export type CoutsLigne = { prixAchatHt?: number | null; coutMainOeuvreHt?: number | null };

export type MargeLigne = { venteHt: number; coutHt: number | null; margeHt: number | null; tauxMarquePct: number | null };

export function margeLigne(l: LigneMontant, couts: CoutsLigne | undefined): MargeLigne {
  const vente = arrondir(montantLigneHtExact(l));
  const achat = couts?.prixAchatHt;
  if (achat === null || achat === undefined || !Number.isFinite(achat)) {
    return { venteHt: versNombre(vente), coutHt: null, margeHt: null, tauxMarquePct: null };
  }
  const mo = couts?.coutMainOeuvreHt ?? 0;
  const cout = arrondir(mul(dec(achat + (Number.isFinite(mo) ? mo : 0)), dec(l.quantite)));
  const marge = sub(vente, cout);
  return {
    venteHt: versNombre(vente),
    coutHt: versNombre(cout),
    margeHt: versNombre(marge),
    tauxMarquePct: estNul(vente) ? null : versNombre(diviserArrondi(mul(marge, dec(100)), vente, 1)),
  };
}
