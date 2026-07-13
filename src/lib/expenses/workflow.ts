export const STATUTS_DEPENSE = [
  "brouillon",
  "a_completer",
  "soumis",
  "en_verification",
  "correction_demandee",
  "valide",
  "refuse",
  "exporte_comptabilite",
  "verrouille",
  "archive",
] as const;

export type StatutDepense = (typeof STATUTS_DEPENSE)[number];
export type ProfilWorkflow = "salarie" | "responsable" | "comptable" | "administrateur";

export const TRANSITIONS_DEPENSE: Record<ProfilWorkflow, Partial<Record<StatutDepense, StatutDepense[]>>> = {
  salarie: {
    brouillon: ["soumis"],
    a_completer: ["soumis"],
    correction_demandee: ["soumis"],
  },
  responsable: {
    soumis: ["en_verification", "correction_demandee", "valide", "refuse"],
    en_verification: ["correction_demandee", "valide", "refuse"],
  },
  comptable: {
    valide: ["exporte_comptabilite"],
  },
  administrateur: {
    valide: ["exporte_comptabilite", "verrouille"],
    exporte_comptabilite: ["verrouille"],
    verrouille: ["archive"],
  },
};

export function transitionAutorisee(profil: ProfilWorkflow, avant: StatutDepense, apres: StatutDepense): boolean {
  return TRANSITIONS_DEPENSE[profil][avant]?.includes(apres) ?? false;
}

export function verifierTotaux(ht: number | null, tva: number | null, ttc: number): string[] {
  const erreurs: string[] = [];
  if (![ttc, ht ?? 0, tva ?? 0].every(Number.isFinite) || ttc < 0 || (ht ?? 0) < 0 || (tva ?? 0) < 0) erreurs.push("Montant invalide");
  if (ht !== null && tva !== null && Math.abs(ht + tva - ttc) > 0.02) erreurs.push("HT + TVA est différent du TTC");
  return erreurs;
}
