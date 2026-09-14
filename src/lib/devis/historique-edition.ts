/**
 * Annuler / rétablir de l'éditeur de devis — module PUR.
 *
 * Deux piles bornées d'instantanés immuables. Chaque modification validée (une cellule quittée,
 * une ligne ajoutée, déplacée, retirée…) pousse un instantané ; annuler en dépile un, rétablir le
 * remet. Une nouvelle modification après une annulation efface la pile « rétablir », comme dans
 * tout éditeur. Aucune fusion de frappes : la grille ne pousse qu'à la validation d'une cellule.
 */

export type HistoriqueEdition<T> = {
  readonly present: T;
  readonly passe: readonly T[];
  readonly futur: readonly T[];
  readonly limite: number;
};

export const LIMITE_HISTORIQUE = 100;

export function creerHistorique<T>(initial: T, limite = LIMITE_HISTORIQUE): HistoriqueEdition<T> {
  return { present: initial, passe: [], futur: [], limite: Math.max(1, limite) };
}

/** Enregistre un nouvel état. Un état identique (même référence) ne crée pas d'entrée. */
export function pousser<T>(h: HistoriqueEdition<T>, suivant: T): HistoriqueEdition<T> {
  if (Object.is(suivant, h.present)) return h;
  const passe = [...h.passe, h.present];
  return { ...h, present: suivant, passe: passe.length > h.limite ? passe.slice(passe.length - h.limite) : passe, futur: [] };
}

/** Remplace l'état courant SANS créer d'entrée (ex. la base a renvoyé une révision). */
export function remplacerPresent<T>(h: HistoriqueEdition<T>, suivant: T): HistoriqueEdition<T> {
  return { ...h, present: suivant };
}

export const peutAnnuler = <T,>(h: HistoriqueEdition<T>): boolean => h.passe.length > 0;
export const peutRetablir = <T,>(h: HistoriqueEdition<T>): boolean => h.futur.length > 0;

export function annuler<T>(h: HistoriqueEdition<T>): HistoriqueEdition<T> {
  if (!peutAnnuler(h)) return h;
  const passe = h.passe.slice(0, -1);
  return { ...h, present: h.passe[h.passe.length - 1], passe, futur: [h.present, ...h.futur] };
}

export function retablir<T>(h: HistoriqueEdition<T>): HistoriqueEdition<T> {
  if (!peutRetablir(h)) return h;
  const [suivant, ...futur] = h.futur;
  return { ...h, present: suivant, passe: [...h.passe, h.present], futur };
}
