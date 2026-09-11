/**
 * Prix d'un article du catalogue : prix d'achat, coefficient, prix de vente, marge — module PUR.
 *
 * Mêmes définitions que les ouvrages (`src/lib/devis/prix.ts`) pour qu'un article et un ouvrage se
 * lisent de la même façon :
 *   marge HT       = prix de vente − prix d'achat ;
 *   taux de marge  = marge / prix d'achat (en %) ;
 *   taux de marque = marge / prix de vente (en %) ;
 *   coefficient    = prix de vente / prix d'achat.
 *
 * Arithmétique décimale exacte (`montants.ts`), arrondi comme `round()` PostgreSQL : l'écran propose
 * exactement le prix que la base enregistrera.
 */
import { arrondir, cmp, dec, diviserArrondi, estNul, mul, sub, versNombre } from "@/lib/devis/montants";

export type ModePrix = "saisi" | "calcule";

export const COEFFICIENT_MAX = 1000;
/** Plafond de `numeric(12, 4)`, comme le prix d'achat. */
const PRIX_MAX = 99_999_999.9999;

/** Prix de vente HT proposé en mode « calculé » : prix d'achat × coefficient, arrondi au centime. */
export function prixVenteDepuisCoefficient(prixAchatHt: number, coefficient: number): number {
  return versNombre(arrondir(mul(dec(prixAchatHt), dec(coefficient)), 2));
}

/** Coefficient qui mène de ce prix d'achat à ce prix de vente (4 décimales) ; `null` si l'achat est nul. */
export function coefficientDepuisPrix(prixVenteHt: number, prixAchatHt: number): number | null {
  const achat = dec(prixAchatHt);
  if (estNul(achat)) return null;
  return versNombre(diviserArrondi(dec(prixVenteHt), achat, 4));
}

export type IndicateursArticle = {
  /** `null` : prix d'achat inconnu ou non visible avec les droits de l'utilisateur. */
  margeHt: number | null;
  tauxMargePct: number | null;
  tauxMarquePct: number | null;
  coefficient: number | null;
  /** Vendu sous le prix d'achat. */
  sousLeCout: boolean;
};

export function indicateursArticle(prixVenteHt: number, prixAchatHt: number | null): IndicateursArticle {
  if (prixAchatHt === null) {
    return { margeHt: null, tauxMargePct: null, tauxMarquePct: null, coefficient: null, sousLeCout: false };
  }
  const vente = dec(prixVenteHt);
  const achat = dec(prixAchatHt);
  const marge = sub(vente, achat);
  const cent = dec(100);
  return {
    margeHt: versNombre(arrondir(marge, 2)),
    tauxMargePct: estNul(achat) ? null : versNombre(diviserArrondi(mul(marge, cent), achat, 2)),
    tauxMarquePct: estNul(vente) ? null : versNombre(diviserArrondi(mul(marge, cent), vente, 2)),
    coefficient: coefficientDepuisPrix(prixVenteHt, prixAchatHt),
    sousLeCout: cmp(vente, achat) < 0,
  };
}

const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Coefficient saisi (virgule acceptée). Vide → `null`. Borné comme la contrainte SQL : ]0 ; 1000]. */
export function lireCoefficient(v: unknown): { valeur: number | null } | { erreur: string } {
  const s = texte(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return { valeur: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { erreur: "Coefficient invalide." };
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > COEFFICIENT_MAX) {
    return { erreur: `Le coefficient doit être supérieur à 0 et au plus ${COEFFICIENT_MAX}.` };
  }
  return { valeur: Math.round(n * 10000) / 10000 };
}

export function lireModePrix(v: unknown): ModePrix {
  return texte(v) === "calcule" ? "calcule" : "saisi";
}

/**
 * Prix de vente à enregistrer. En mode calculé, il est RECALCULÉ depuis le prix d'achat et le
 * coefficient (le champ du formulaire est ignoré) ; il faut alors les deux. En mode saisi, le prix
 * du formulaire fait foi.
 */
export function prixVenteRetenu(
  mode: ModePrix,
  prixSaisiHt: number,
  prixAchatHt: number | null,
  coefficient: number | null,
): { valeur: number } | { erreur: string } {
  if (mode === "saisi") return { valeur: prixSaisiHt };
  if (prixAchatHt === null || coefficient === null) {
    return { erreur: "Le prix calculé demande un prix d’achat et un coefficient." };
  }
  const prix = prixVenteDepuisCoefficient(prixAchatHt, coefficient);
  if (prix > PRIX_MAX) return { erreur: "Le prix calculé dépasse le plafond autorisé." };
  return { valeur: prix };
}
