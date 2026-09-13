/**
 * Rappel de sauvegarde (GP V1) — décision pure, testée à part de l'interface.
 *
 * Distinct de l'autosauvegarde technique (protection des données, inchangée) : le rappel n'écrit jamais rien,
 * il informe. Il n'apparaît que si le devis a été modifié depuis la dernière sauvegarde réussie ET si la
 * fréquence est écoulée depuis le dernier point de référence (dernière sauvegarde réussie, dernier rappel
 * affiché ou « Plus tard »). Une sauvegarde échouée ne remet pas le compteur à zéro. Peut être coupé pour un
 * devis (« Ne plus me le rappeler pour ce devis »).
 */
export type EtatRappel = {
  actif: boolean;
  /** Fréquence en minutes (1 à 240 ; les tests peuvent passer une fraction). */
  minutes: number;
  /** Le devis porte des modifications non persistées. */
  modifie: boolean;
  /** Horodatage (ms) de la dernière sauvegarde RÉUSSIE (manuelle ou autosauvegarde). */
  derniereSauvegardeReussieA: number;
  /** Horodatage (ms) du dernier rappel affiché ou reporté (« Plus tard »), sinon `null`. */
  dernierRappelA: number | null;
  /** « Ne plus me le rappeler pour ce devis ». */
  ignorePourCeDevis: boolean;
  /** Le rappel est déjà affiché. */
  dejaAffiche: boolean;
};

export function delaiRappelMs(minutes: number): number {
  return Math.max(1_000, Math.round(minutes * 60_000));
}

/** Vrai si le rappel doit s'afficher maintenant. */
export function doitRappeler(e: EtatRappel, maintenant: number): boolean {
  if (!e.actif || e.ignorePourCeDevis || e.dejaAffiche || !e.modifie) return false;
  const reference = Math.max(e.derniereSauvegardeReussieA, e.dernierRappelA ?? 0);
  return maintenant - reference >= delaiRappelMs(e.minutes);
}

/** Clé de stockage de session pour « ne plus me le rappeler pour ce devis ». */
export function cleIgnorerRappel(devisId: string | null): string {
  return `gp.devis.rappel.ignore.${devisId ?? "nouveau"}`;
}
