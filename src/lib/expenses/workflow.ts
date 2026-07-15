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

export function calculerTotauxDepense(ht: number | null, tva: number | null, ttc: number | null, taux: number | null) {
  const arrondi = (value: number) => Math.round(value * 100) / 100;
  if (ttc !== null && taux !== null && taux >= 0 && (ht === null || tva === null)) {
    const montantHt = arrondi(ttc / (1 + taux / 100));
    return { ht: montantHt, tva: arrondi(ttc - montantHt), ttc, taux };
  }
  if (ht !== null && taux !== null && taux >= 0 && (tva === null || ttc === null)) {
    const montantTva = arrondi(ht * taux / 100);
    return { ht, tva: montantTva, ttc: arrondi(ht + montantTva), taux };
  }
  if (ht !== null && tva !== null && ttc === null) {
    return { ht, tva, ttc: arrondi(ht + tva), taux: taux ?? (ht > 0 ? arrondi(tva / ht * 100) : null) };
  }
  return { ht, tva, ttc, taux };
}
