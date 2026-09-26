// RELANCES-AUTO-V1 : types, valeurs par défaut et libellés — logique pure, sans accès base,
// partagée par le moteur d'éligibilité (relances-moteur.ts), l'UI et les tests.

export type TypeDocumentRelance = "devis" | "facture";

export type ParametresRelances = {
  entrepriseId: string;
  devisAutoActif: boolean;
  devisDelaiPremiereRelanceJours: number;
  devisDelaiEntreRelancesJours: number;
  devisNombreMaxRelances: number;
  facturesAutoActif: boolean;
  facturesDelaiPremiereRelanceJours: number;
  facturesDelaiEntreRelancesJours: number;
  facturesNombreMaxRelances: number;
  envoyerWeekend: boolean;
  pauseJusquAu: string | null;
};

// §10 : valeurs par défaut clairement documentées et modifiables — point de départ, pas une
// cadence commerciale imposée. Reprennent exactement les défauts des colonnes en base
// (supabase/migrations/20260824000230_relances_auto_v1.sql) : aucune entreprise n'a jamais eu
// de pratique de relance automatique dans ce produit avant ce lot, il n'y a donc rien
// d'existant à respecter — ces valeurs sont un point de départ raisonnable (délais BTP
// usuels), désactivées par défaut (devisAutoActif/facturesAutoActif = false) tant qu'un admin
// ne les active pas explicitement (§11).
export const PARAMETRES_RELANCES_DEFAUT: Omit<ParametresRelances, "entrepriseId"> = {
  devisAutoActif: false,
  devisDelaiPremiereRelanceJours: 7,
  devisDelaiEntreRelancesJours: 7,
  devisNombreMaxRelances: 2,
  facturesAutoActif: false,
  facturesDelaiPremiereRelanceJours: 3,
  facturesDelaiEntreRelancesJours: 7,
  facturesNombreMaxRelances: 3,
  envoyerWeekend: false,
  pauseJusquAu: null,
};

export const NIVEAU_MIN = 1;
export const NIVEAU_MAX = 5;

// Libellé dynamique plutôt que 3 niveaux hardcodés : le dernier niveau configuré est
// toujours "finale", quel que soit nombreMax (1 à 5) — évite d'imposer une stratégie
// commerciale à 3 paliers fixes (§8).
export function libelleNiveauRelance(type: TypeDocumentRelance, niveau: number, nombreMax: number): string {
  const estFinale = niveau >= nombreMax;
  if (type === "devis") {
    if (estFinale && nombreMax > 1) return "Relance finale";
    if (niveau === 1) return "Relance douce";
    return `Relance ${niveau}`;
  }
  if (estFinale && nombreMax > 1) return "Relance finale";
  if (niveau === 1) return "Rappel d'échéance";
  return `Relance impayé ${niveau > 2 ? niveau - 1 : ""}`.trim();
}

export function estEnPause(config: Pick<ParametresRelances, "pauseJusquAu">, aujourdhui = new Date()): boolean {
  if (!config.pauseJusquAu) return false;
  return config.pauseJusquAu >= aujourdhui.toISOString().slice(0, 10);
}

export function estWeekend(date: Date): boolean {
  const jour = date.getDay();
  return jour === 0 || jour === 6;
}
