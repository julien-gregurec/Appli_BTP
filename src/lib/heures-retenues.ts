// Règle minimale sûre (recette métier GP, B37) : un pointage rejeté par le
// responsable n'est jamais du temps travaillé et ne gonfle aucun total.
// Les pointages « à vérifier » restent comptés (PENDING vs VALIDATED : règle
// produit non tranchée, voir ELSATIA_GP_BUSINESS_HARDENING_V9_1.md).
export type PointageHeures = {
  heures_normales: number | string | null;
  heures_supplementaires: number | string | null;
  verification_statut?: string | null;
};

export function pointagesRetenus<T extends PointageHeures>(pointages: T[]): T[] {
  return pointages.filter((p) => p.verification_statut !== "rejete");
}

export function totauxHeuresRetenues(pointages: PointageHeures[]): { normales: number; supplementaires: number; total: number } {
  let normales = 0;
  let supplementaires = 0;
  for (const p of pointagesRetenus(pointages)) {
    normales += Number(p.heures_normales ?? 0);
    supplementaires += Number(p.heures_supplementaires ?? 0);
  }
  return { normales, supplementaires, total: normales + supplementaires };
}
