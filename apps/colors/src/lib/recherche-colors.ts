import type { EtatSeau, SeauColors } from "@/lib/colors-types";

export type FiltresInventaire = { q?: string; marque?: string; emplacementId?: string; etat?: EtatSeau | "tous"; stockFaible?: boolean; sansPhoto?: boolean };
const normaliser = (valeur: string | null | undefined) => (valeur ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function filtrerInventaire(seaux: SeauColors[], filtres: FiltresInventaire, seuil = 20) {
  const q = normaliser(filtres.q);
  return seaux.filter((seau) => {
    if (q && !normaliser([seau.marque,seau.produit,seau.reference_produit,seau.teinte_nom,seau.teinte_reference,seau.couleur_hex,seau.ral_approxime].join(" ")).includes(q)) return false;
    if (filtres.marque && seau.marque !== filtres.marque) return false;
    if (filtres.emplacementId && seau.emplacement_id !== filtres.emplacementId) return false;
    if (filtres.etat && filtres.etat !== "tous" && seau.etat !== filtres.etat) return false;
    if (filtres.stockFaible && !(seau.pourcentage_restant <= seuil && seau.etat !== "archive")) return false;
    if (filtres.sansPhoto && seau.photo_principale_path) return false;
    return true;
  });
}
