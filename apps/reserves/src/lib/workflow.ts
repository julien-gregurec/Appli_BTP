// Miroir de la matrice `public.reserves_transitions`.
//
// L'AUTORITÉ RESTE LA BASE : ce module ne sert qu'à décider quels boutons afficher et à
// formuler les libellés. Aucune décision de sécurité n'en dépend — une transition que
// ce fichier autoriserait à tort serait refusée par `reserves_appliquer_transition()`.
// Le test `workflow.test.ts` vérifie que le miroir reste aligné sur la migration.

export const STATUTS_RESERVE = [
  "emise",
  "assignee",
  "refusee_responsabilite",
  "acceptee",
  "levee_demandee",
  "levee_refusee",
  "levee",
  "annulee",
] as const;
export type StatutReserve = (typeof STATUTS_RESERVE)[number];

export const PRIORITES_RESERVE = ["basse", "normale", "haute", "bloquante"] as const;
export type PrioriteReserve = (typeof PRIORITES_RESERVE)[number];

export type ActeurReserve = "hote" | "intervenant";

export type TransitionReserve = {
  statutAvant: StatutReserve;
  statutApres: StatutReserve;
  acteur: ActeurReserve;
  action: string;
  commentaireObligatoire: boolean;
};

export const TRANSITIONS_RESERVE: readonly TransitionReserve[] = [
  { statutAvant: "emise", statutApres: "assignee", acteur: "hote", action: "assignation", commentaireObligatoire: false },
  { statutAvant: "emise", statutApres: "annulee", acteur: "hote", action: "annulation", commentaireObligatoire: true },
  { statutAvant: "assignee", statutApres: "acceptee", acteur: "intervenant", action: "acceptation", commentaireObligatoire: false },
  { statutAvant: "assignee", statutApres: "refusee_responsabilite", acteur: "intervenant", action: "refus_responsabilite", commentaireObligatoire: true },
  { statutAvant: "assignee", statutApres: "assignee", acteur: "hote", action: "reassignation", commentaireObligatoire: false },
  { statutAvant: "assignee", statutApres: "annulee", acteur: "hote", action: "annulation", commentaireObligatoire: true },
  { statutAvant: "refusee_responsabilite", statutApres: "assignee", acteur: "hote", action: "reassignation", commentaireObligatoire: false },
  { statutAvant: "refusee_responsabilite", statutApres: "annulee", acteur: "hote", action: "annulation", commentaireObligatoire: true },
  { statutAvant: "acceptee", statutApres: "levee_demandee", acteur: "intervenant", action: "demande_levee", commentaireObligatoire: false },
  { statutAvant: "acceptee", statutApres: "annulee", acteur: "hote", action: "annulation", commentaireObligatoire: true },
  { statutAvant: "levee_demandee", statutApres: "levee", acteur: "hote", action: "levee_validee", commentaireObligatoire: false },
  { statutAvant: "levee_demandee", statutApres: "levee_refusee", acteur: "hote", action: "levee_refusee", commentaireObligatoire: true },
  { statutAvant: "levee_refusee", statutApres: "levee_demandee", acteur: "intervenant", action: "demande_levee", commentaireObligatoire: false },
  { statutAvant: "levee", statutApres: "assignee", acteur: "hote", action: "reouverture", commentaireObligatoire: true },
];

export const LIBELLES_STATUT: Record<StatutReserve, string> = {
  emise: "Émise",
  assignee: "Assignée",
  refusee_responsabilite: "Responsabilité refusée",
  acceptee: "Acceptée",
  levee_demandee: "Levée demandée",
  levee_refusee: "Levée refusée",
  levee: "Levée",
  annulee: "Annulée",
};

export const LIBELLES_PRIORITE: Record<PrioriteReserve, string> = {
  basse: "Basse",
  normale: "Normale",
  haute: "Haute",
  bloquante: "Bloquante",
};

export function transitionsPossibles(
  statut: StatutReserve,
  acteur: ActeurReserve,
): TransitionReserve[] {
  return TRANSITIONS_RESERVE.filter(
    (t) => t.statutAvant === statut && t.acteur === acteur,
  );
}

export function transitionAutorisee(
  statut: StatutReserve,
  cible: StatutReserve,
  acteur: ActeurReserve,
): boolean {
  return TRANSITIONS_RESERVE.some(
    (t) => t.statutAvant === statut && t.statutApres === cible && t.acteur === acteur,
  );
}

export function estStatutTermine(statut: StatutReserve): boolean {
  return statut === "levee" || statut === "annulee";
}

/**
 * Une réserve est « en retard » dès que son échéance est dépassée et qu'elle n'est ni
 * levée ni annulée. Même définition que l'index et que `reserves_tableau_de_bord()`.
 */
export function estEnRetard(
  reserve: { statut: StatutReserve; echeance: string | null },
  aujourdHui: Date = new Date(),
): boolean {
  if (!reserve.echeance || estStatutTermine(reserve.statut)) return false;
  const jour = aujourdHui.toISOString().slice(0, 10);
  return reserve.echeance < jour;
}

/**
 * Décide si la demande de levée est possible, en reproduisant le contrôle serveur :
 * l'exigence de photo est portée par la réserve elle-même, jamais par un réglage global.
 * Le refus définitif reste prononcé en base ; ici on n'évite qu'un aller-retour inutile.
 */
export function peutDemanderLevee(reserve: {
  statut: StatutReserve;
  photoObligatoireLevee: boolean;
  nbPhotosTravaux: number;
}): { possible: boolean; motif: string | null } {
  if (!transitionAutorisee(reserve.statut, "levee_demandee", "intervenant")) {
    return { possible: false, motif: "L’état actuel de la réserve ne permet pas de demander la levée." };
  }
  if (reserve.photoObligatoireLevee && reserve.nbPhotosTravaux === 0) {
    return { possible: false, motif: "Une photo des travaux est exigée sur cette réserve avant la demande de levée." };
  }
  return { possible: true, motif: null };
}
