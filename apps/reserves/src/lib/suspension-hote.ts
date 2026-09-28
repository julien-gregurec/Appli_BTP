/**
 * Décision D-01 — organisation HÔTE suspendue : l'entreprise intervenante passe en
 * LECTURE SEULE (migration `20260927000506_reserves_hote_suspendu_lecture_seule_v1`).
 *
 * L'AUTORITÉ EST LA BASE : `reserves_acteur_courant` et le trigger
 * `reserves_garde_hote_suspendu` refusent toute écriture, par n'importe quel chemin. Ce
 * module — pur, sans `server-only`, pour rester testable — ne sert qu'à :
 *   • reconnaître ce refus parmi les autres (indice stable transmis par PostgREST) ;
 *   • en donner une explication honnête à l'écran et dans la file hors-ligne ;
 *   • décider quelles commandes l'écran masque.
 */

/** Indice (`hint`) posé par la base sur chaque refus lié à la suspension de l'hôte. */
export const CODE_HOTE_SUSPENDU = "RESERVES_HOTE_SUSPENDU";

export const MESSAGE_LECTURE_SEULE =
  "L’organisation qui a créé ce chantier a suspendu son accès à ELSATIA Réserves. "
  + "Vous pouvez consulter vos réserves, leur historique, les photos, le plan et le "
  + "document PDF, mais aucune action n’est possible jusqu’au rétablissement de son accès. "
  + "Votre invitation reste valable : rien ne sera à refaire.";

export const MOTIF_FILE_HORS_LIGNE =
  "Action non transmise : l’organisation qui a créé ce chantier a suspendu son accès. "
  + "La réserve est en lecture seule ; votre saisie reste sur cet appareil et pourra être "
  + "renvoyée quand l’accès sera rétabli.";

type ErreurServeur = { message?: string | null; hint?: string | null; code?: string | null };

/**
 * Vrai si l'erreur rendue par Supabase est le refus « hôte suspendu ».
 *
 * L'indice est le discriminant : le message est destiné à l'humain et peut évoluer.
 * Le message reste accepté en secours, pour un intermédiaire qui ne relaierait pas
 * l'indice.
 */
export function estRefusHoteSuspendu(erreur: ErreurServeur | null | undefined): boolean {
  if (!erreur) return false;
  if (erreur.hint === CODE_HOTE_SUSPENDU) return true;
  return typeof erreur.message === "string"
    && erreur.message.startsWith("Organisation hôte suspendue");
}

/** Motif à consigner pour une mutation hors-ligne refusée par le serveur. */
export function motifRefusMutation(erreur: ErreurServeur | null | undefined, defaut: string): string {
  if (estRefusHoteSuspendu(erreur)) return MOTIF_FILE_HORS_LIGNE;
  return erreur?.message || defaut;
}

/**
 * Commandes d'écriture qu'un écran de réserve peut proposer.
 *
 * En lecture seule, AUCUNE : accepter, refuser, demander la levée, joindre une photo,
 * retirer une photo, commenter. La consultation (galerie, plan, historique, échanges,
 * PDF) n'est pas une commande et reste toujours affichée.
 */
export type CommandesReserve = {
  repondreResponsabilite: boolean;
  demanderLevee: boolean;
  joindrePhoto: boolean;
  retirerPhoto: boolean;
  commenter: boolean;
};

export function commandesReserve(lectureSeule: boolean): CommandesReserve {
  const ouvert = !lectureSeule;
  return {
    repondreResponsabilite: ouvert,
    demanderLevee: ouvert,
    joindrePhoto: ouvert,
    retirerPhoto: ouvert,
    commenter: ouvert,
  };
}
