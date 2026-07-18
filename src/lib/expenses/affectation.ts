export const LIEUX_HORS_CHANTIER = [
  { cle: "sans_chantier", valeur: "hors:sans_chantier", libelle: "Sans chantier" },
  { cle: "depot", valeur: "hors:depot", libelle: "Dépôt" },
  { cle: "bureau", valeur: "hors:bureau", libelle: "Bureau" },
] as const;

export type LieuHorsChantier = (typeof LIEUX_HORS_CHANTIER)[number]["cle"];

const CLES_LIEU = new Set<string>(LIEUX_HORS_CHANTIER.map((lieu) => lieu.cle));

export function analyserAffectationDepense(valeur: string | null | undefined): {
  chantierId: string | null;
  lieuHorsChantier: LieuHorsChantier | null;
} {
  const selection = valeur?.trim() ?? "";
  if (!selection || selection === "hors:sans_chantier") {
    return { chantierId: null, lieuHorsChantier: "sans_chantier" };
  }
  if (selection.startsWith("hors:")) {
    const cle = selection.slice(5);
    if (!CLES_LIEU.has(cle)) throw new Error("Lieu de dépense invalide");
    return { chantierId: null, lieuHorsChantier: cle as LieuHorsChantier };
  }
  return { chantierId: selection, lieuHorsChantier: null };
}

export function valeurAffectationDepense(
  chantierId: string | null | undefined,
  lieuHorsChantier: string | null | undefined,
) {
  if (chantierId) return chantierId;
  return `hors:${CLES_LIEU.has(lieuHorsChantier ?? "") ? lieuHorsChantier : "sans_chantier"}`;
}

export function libelleAffectationDepense(
  chantierNom: string | null | undefined,
  lieuHorsChantier: string | null | undefined,
) {
  if (chantierNom) return chantierNom;
  return LIEUX_HORS_CHANTIER.find((lieu) => lieu.cle === lieuHorsChantier)?.libelle ?? "Sans chantier";
}
