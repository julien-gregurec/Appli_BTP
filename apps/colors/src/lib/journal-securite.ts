import "server-only";

/**
 * Journalisation serveur des échecs techniques.
 *
 * Les messages d'erreur PostgreSQL et Supabase Auth restent utiles au
 * diagnostic, mais ne doivent jamais atteindre l'URL, le HTML rendu ni la
 * console du navigateur : ils décrivent le schéma, les contraintes et parfois
 * les valeurs manipulées. Ils sont donc écrits ici, côté serveur uniquement.
 *
 * Aucune donnée d'identification n'est acceptée : la signature ne prend qu'une
 * étiquette d'opération et l'objet d'erreur du client. Ni mot de passe, ni
 * jeton, ni code d'authentification ne transite par cette fonction.
 */
export function journaliserEchecTechnique(
  operation: string,
  erreur: { message?: string } | null | undefined,
): void {
  console.error(`[colors] échec ${operation}`, erreur?.message ?? "sans message");
}
