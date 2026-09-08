/**
 * Validation de forme du `token_hash` reçu dans un lien de récupération.
 *
 * Le jeton n'est pas vérifié ici — seul Supabase peut le faire — mais sa forme
 * est contrôlée avant d'être replacée dans un champ de formulaire. Cela écarte
 * sans appel réseau les valeurs manifestement forgées et garde la page
 * intermédiaire inerte face à une URL bricolée.
 *
 * GoTrue émet des empreintes hexadécimales ; l'alphabet accepté est élargi aux
 * caractères non réservés des URL pour ne pas dépendre d'un format qui pourrait
 * évoluer, tout en excluant guillemets, chevrons et espaces.
 */
const FORME_JETON = /^[A-Za-z0-9._~-]{16,512}$/;

/** Type de vérification accepté par Colors : la récupération, et elle seule. */
export const TYPE_RECUPERATION = "recovery";

/**
 * Renvoie le jeton si le lien est exploitable, `null` sinon.
 *
 * Colors n'ouvre aucun parcours de confirmation d'inscription : tout `type`
 * autre que `recovery` est refusé avant même de solliciter Supabase.
 */
export function jetonRecuperationSur(tokenHash: unknown, type: unknown): string | null {
  if (type !== TYPE_RECUPERATION) return null;
  if (typeof tokenHash !== "string") return null;
  return FORME_JETON.test(tokenHash) ? tokenHash : null;
}
