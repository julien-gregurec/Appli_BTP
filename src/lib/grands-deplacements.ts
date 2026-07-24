export type ModeGrandDeplacement = "frais_reels" | "forfait_urssaf";

export type BaremeGrandDeplacement = {
  repas: number;
  logementParis: number;
  logementProvince: number;
};

export const BAREMES_GRAND_DEPLACEMENT_2026 = {
  phase1: { repas: 21.4, logementParis: 76.6, logementProvince: 56.8 },
  phase2: { repas: 18.2, logementParis: 65.1, logementProvince: 48.3 },
  phase3: { repas: 15, logementParis: 53.6, logementProvince: 39.8 },
} satisfies Record<string, BaremeGrandDeplacement>;

export function phaseBareme(dateOrigine: string, dateDebut: string): keyof typeof BAREMES_GRAND_DEPLACEMENT_2026 {
  const origine = Date.parse(`${dateOrigine}T12:00:00Z`);
  const debut = Date.parse(`${dateDebut}T12:00:00Z`);
  const jours = Math.max(0, Math.floor((debut - origine) / 86_400_000));
  if (jours < 90) return "phase1";
  if (jours < 730) return "phase2";
  return "phase3";
}

export function calculerForfaitGrandDeplacement({
  dateOrigine,
  dateDebut,
  nbRepas,
  nbNuits,
  zone,
  baremes = BAREMES_GRAND_DEPLACEMENT_2026,
}: {
  dateOrigine: string;
  dateDebut: string;
  nbRepas: number;
  nbNuits: number;
  zone: "paris" | "province";
  baremes?: typeof BAREMES_GRAND_DEPLACEMENT_2026;
}) {
  const phase = phaseBareme(dateOrigine, dateDebut);
  const bareme = baremes[phase];
  const tauxLogement = zone === "paris" ? bareme.logementParis : bareme.logementProvince;
  const montant = Math.round((Math.max(0, nbRepas) * bareme.repas + Math.max(0, nbNuits) * tauxLogement) * 100) / 100;
  return { phase, montant, tauxRepas: bareme.repas, tauxLogement };
}
