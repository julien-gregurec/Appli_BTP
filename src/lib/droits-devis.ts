/**
 * Droits fins du devis (GP V1, lot D, décision D4) — module PUR, miroir de `public.droit_fin`.
 *
 * `permissionsUtilisateur` rend la liste des clés ACCORDÉES (`null` = accès total). Un droit fin est
 * ouvert s'il est accordé, sinon hérité de son droit parent (`gerer_devis`, `gerer_planning`) : un poste
 * qui gère les devis ne perd rien. Une clé configurée à faux n'est pas visible d'ici : c'est la base qui
 * la refuse (RLS, déclencheur, RPC) — l'écran propose, la base dispose.
 */

export const DROITS_FINS_DEVIS = {
  modifier_prix_vente: "gerer_devis",
  modifier_remise: "gerer_devis",
  supprimer_devis: "gerer_devis",
  transformer_devis: "gerer_devis",
  envoyer_devis: "gerer_devis",
  affecter_ressources: "gerer_planning",
} as const;

export type DroitFin = keyof typeof DROITS_FINS_DEVIS;

export function possedeDroitFin(permissions: readonly string[] | null, droit: DroitFin): boolean {
  if (permissions === null) return true;
  return permissions.includes(droit) || permissions.includes(DROITS_FINS_DEVIS[droit]);
}

/** Motif lisible d'une action refusée, pour l'infobulle d'une action grisée. */
export const MOTIF_DROIT_FIN: Record<DroitFin, string> = {
  modifier_prix_vente: "Votre poste ne permet pas de modifier les prix de vente.",
  modifier_remise: "Votre poste ne permet pas d’accorder des remises.",
  supprimer_devis: "Votre poste ne permet pas de supprimer un devis.",
  transformer_devis: "Votre poste ne permet pas de transformer un devis.",
  envoyer_devis: "Votre poste ne permet pas d’envoyer un devis.",
  affecter_ressources: "Votre poste ne permet pas d’affecter des ressources.",
};
