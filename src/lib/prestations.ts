import type { LigneDevis } from "@/lib/devis";

export const PRESTATION_TYPES = [
  { value: "main_oeuvre", label: "Main-d’œuvre" },
  { value: "fourniture", label: "Fourniture" },
  { value: "sous_traitance", label: "Sous-traitance" },
  { value: "deplacement", label: "Déplacement" },
  { value: "forfait", label: "Forfait" },
] as const;

export function typePrestationLabel(type: string) {
  return PRESTATION_TYPES.find((item) => item.value === type)?.label ?? type;
}

export type PrestationCatalogue = {
  id: string;
  designation: string;
  description: string | null;
  type: LigneDevis["type"];
  unite: string;
  prix_unitaire_ht: number;
  taux_tva: number;
};

export function prestationVersLigne(prestation: PrestationCatalogue): LigneDevis {
  return {
    designation: prestation.designation,
    description: prestation.description,
    type: prestation.type,
    quantite: 1,
    unite: prestation.unite,
    prix_unitaire_ht: Number(prestation.prix_unitaire_ht),
    remise_ligne: 0,
    taux_tva: Number(prestation.taux_tva),
  };
}
