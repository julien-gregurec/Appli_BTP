const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identifiant d'envoi d'un formulaire de création, fixé au rendu (champ caché).
 *
 * Il sert de clé primaire à la ligne créée : un second envoi du même formulaire heurte la
 * contrainte au lieu de produire un doublon. Tout ce qui n'est pas un UUID est ignoré — la
 * base génère alors l'identifiant, comme avant ce correctif.
 */
export function identifiantEnvoi(valeur: FormDataEntryValue | null): string | null {
  return typeof valeur === "string" && UUID.test(valeur) ? valeur.toLowerCase() : null;
}
