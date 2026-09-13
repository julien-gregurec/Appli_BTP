/**
 * Fiche devis en LECTURE (GP V1) — regroupement des lignes enregistrées pour l'affichage, module PUR.
 *
 * La table `lignes_devis` porte les lignes de structure (titre, commentaire…) avec quantité et prix à 0,
 * et les composants d'un ouvrage rattachés par `ouvrage_cle`. Sans regroupement, la fiche affichait
 * « Fourniture · 0 u · 0,00 € » pour un titre et éclatait l'ouvrage en composants (constaté en recette
 * preview). Ce module produit des rangées d'affichage : structure, en-tête d'ouvrage suivi de ses
 * composants, ligne chiffrée, remise, sous-total CALCULÉ (somme depuis le sous-total précédent).
 */
import { estTypeLigne, libelleTypeLigne, type TypeLigneGrille } from "@/lib/devis/types-ligne";

export type LigneLue = {
  id: string;
  designation: string;
  description: string | null;
  type: string;
  type_ligne: string | null;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  remise_ligne: number;
  remise_section_pct: number | null;
  taux_tva: number;
  ouvrage_cle: string | null;
};

export type OuvrageLu = {
  cle: string;
  ouvrage_reference: string | null;
  ouvrage_nom: string;
  libelle_client: string | null;
  quantite_principale: number;
  unite_principale: string;
};

export type RangeeLecture =
  | { genre: "structure"; cle: string; typeLigne: TypeLigneGrille; designation: string; description: string | null }
  | { genre: "ouvrage"; cle: string; designation: string; reference: string | null; quantite: number; unite: string; totalHt: number }
  | { genre: "ligne"; cle: string; ligne: LigneLue; totalHt: number; composant: boolean }
  | { genre: "remise"; cle: string; ligne: LigneLue; totalHt: number; libelle: string }
  | { genre: "sous_total"; cle: string; designation: string; totalHt: number };

const STRUCTURE: ReadonlySet<TypeLigneGrille> = new Set(["titre", "sous_titre", "commentaire", "vide", "separateur", "saut_page"]);

export function montantLigneHt(l: Pick<LigneLue, "quantite" | "prix_unitaire_ht" | "remise_ligne">): number {
  return Math.round(l.quantite * l.prix_unitaire_ht * (1 - (l.remise_ligne ?? 0) / 100) * 100) / 100;
}

/** Rangées d'affichage dans l'ordre des lignes ; un ouvrage apparaît une fois, avant son premier composant. */
export function rangeesLecture(lignes: readonly LigneLue[], ouvrages: readonly OuvrageLu[]): RangeeLecture[] {
  const parCle = new Map(ouvrages.map((o) => [o.cle, o]));
  const totalParOuvrage = new Map<string, number>();
  for (const l of lignes) if (l.ouvrage_cle) totalParOuvrage.set(l.ouvrage_cle, (totalParOuvrage.get(l.ouvrage_cle) ?? 0) + montantLigneHt(l));
  const rangees: RangeeLecture[] = [];
  const ouvragesVus = new Set<string>();
  let cumul = 0;
  for (const l of lignes) {
    const type: TypeLigneGrille = estTypeLigne(l.type_ligne) ? l.type_ligne : "libre";
    if (STRUCTURE.has(type)) {
      rangees.push({ genre: "structure", cle: l.id, typeLigne: type, designation: l.designation, description: l.description });
      continue;
    }
    if (type === "sous_total") {
      rangees.push({ genre: "sous_total", cle: l.id, designation: l.designation || "Sous-total", totalHt: Math.round(cumul * 100) / 100 });
      cumul = 0;
      continue;
    }
    const totalHt = montantLigneHt(l);
    if (type === "remise") {
      const libelle = l.remise_section_pct !== null && l.remise_section_pct !== undefined ? `${String(l.remise_section_pct).replace(".", ",")} % de la section` : "montant fixe";
      rangees.push({ genre: "remise", cle: l.id, ligne: l, totalHt, libelle });
      cumul += totalHt;
      continue;
    }
    if (l.ouvrage_cle && !ouvragesVus.has(l.ouvrage_cle)) {
      ouvragesVus.add(l.ouvrage_cle);
      const o = parCle.get(l.ouvrage_cle);
      rangees.push({
        genre: "ouvrage", cle: `ouvrage-${l.ouvrage_cle}`,
        designation: o?.libelle_client || o?.ouvrage_nom || "Ouvrage",
        reference: o?.ouvrage_reference ?? null,
        quantite: o?.quantite_principale ?? 0, unite: o?.unite_principale ?? "",
        totalHt: Math.round((totalParOuvrage.get(l.ouvrage_cle) ?? 0) * 100) / 100,
      });
    }
    rangees.push({ genre: "ligne", cle: l.id, ligne: l, totalHt, composant: l.ouvrage_cle !== null });
    cumul += totalHt;
  }
  return rangees;
}

export function libelleStructure(type: TypeLigneGrille): string {
  return libelleTypeLigne(type);
}
