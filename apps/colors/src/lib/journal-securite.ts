import "server-only";

/**
 * Journalisation serveur des échecs techniques.
 *
 * Les messages d'erreur PostgreSQL et Supabase Auth restent utiles au
 * diagnostic, mais ne doivent jamais atteindre l'URL, le HTML rendu ni la
 * console du navigateur : ils décrivent le schéma, les contraintes et parfois
 * les valeurs manipulées. Ils sont donc écrits ici, côté serveur uniquement.
 *
 * ### Pourquoi le message est nettoyé avant d'être écrit
 *
 * « Côté serveur » n'est pas « privé ». Un journal Vercel est lisible par toute
 * personne ayant accès au projet, il est conservé, et il sort du périmètre de
 * cloisonnement par entreprise que le reste de Colors respecte scrupuleusement.
 * Or PostgreSQL fait entrer des valeurs métier dans ses messages :
 *
 *   duplicate key value violates unique constraint "colors_emplacements_..."
 *   Key (entreprise_id, nom)=(0f3a…, Dépôt Nord) already exists.
 *
 * Le nom du dépôt d'un client n'a rien à faire dans un journal d'exploitation.
 * Trois formes connues sont donc retirées avant écriture — le détail `Key (…)=(…)`,
 * les valeurs littérales entre apostrophes et les adresses électroniques — et le
 * reste est tronqué. Ce qui compte au diagnostic, la contrainte violée et le
 * code SQLSTATE, est intégralement conservé.
 *
 * Le nettoyage est délibérément une liste de formes refusées et non une liste
 * de messages autorisés : un message inconnu doit rester lisible, sinon la
 * journalisation cesse de servir au premier cas nouveau.
 *
 * Aucune donnée d'identification n'est acceptée : la signature ne prend qu'une
 * étiquette d'opération et l'objet d'erreur du client. Ni mot de passe, ni
 * jeton, ni code d'authentification ne transite par cette fonction.
 */

export const LONGUEUR_MAXIMALE_MESSAGE = 300;
export const MARQUE_OCCULTATION = "[valeur retirée]";

/** Formes connues pour transporter des valeurs métier dans un message d'erreur. */
const FORMES_A_OCCULTER: readonly RegExp[] = [
  // `Key (colonne, …)=(valeur, …)` — détail des violations de contrainte.
  /Key \([^)]*\)=\([^)]*\)/g,
  // Adresses électroniques, quelle que soit leur place dans le message.
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  // Littéraux entre apostrophes, sauf les identifiants entre guillemets doubles
  // — ceux-ci nomment une contrainte ou une relation, et sont utiles.
  /'[^']*'/g,
];

/**
 * Message réduit à ce qui sert au diagnostic.
 *
 * Exportée pour être éprouvée directement : c'est une garantie de
 * confidentialité, elle doit se tester sans passer par la console.
 */
export function messageJournalisable(message: string | undefined | null): string {
  if (!message || message.trim() === "") return "sans message";
  let nettoye = message;
  for (const forme of FORMES_A_OCCULTER) nettoye = nettoye.replace(forme, MARQUE_OCCULTATION);
  nettoye = nettoye.replace(/\s+/g, " ").trim();
  return nettoye.length > LONGUEUR_MAXIMALE_MESSAGE
    ? `${nettoye.slice(0, LONGUEUR_MAXIMALE_MESSAGE)}…`
    : nettoye;
}

export function journaliserEchecTechnique(
  operation: string,
  erreur: { message?: string; code?: string } | null | undefined,
): void {
  // Le code SQLSTATE ou PostgREST est la partie la plus utile et la moins
  // bavarde : il est journalisé tel quel, avant le message nettoyé.
  const code = typeof erreur?.code === "string" && erreur.code !== "" ? erreur.code : "sans code";
  console.error(`[colors] échec ${operation} (${code})`, messageJournalisable(erreur?.message));
}
