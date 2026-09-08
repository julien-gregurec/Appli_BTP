import { doitAbandonner, type Mutation } from "./contrat";

/**
 * Politique de reprise de la file hors-ligne — module PUR.
 *
 * CE QUI N'ALLAIT PAS EN V5.
 * La coquille hors-ligne relançait une tentative toutes les CINQ SECONDES, indéfiniment,
 * dès qu'il restait quoi que ce soit à envoyer — y compris une mutation en `echec`, que
 * la file ne renvoie JAMAIS d'elle-même. Deux conséquences, opposées et toutes deux
 * mauvaises :
 *
 *   • un téléphone posé sur un chantier sans couverture émettait une sonde réseau toutes
 *     les cinq secondes, sans fin et sans effet — la radio ne se rendort jamais, et c'est
 *     exactement le comportement qui vide une batterie en fin de journée ;
 *   • cette même boucle ne servait à rien pour les mutations en échec, puisque seules les
 *     mutations `en_attente` sont éligibles à l'envoi : elle tournait à vide.
 *
 * Et dans la coquille applicative (`AtelierOffline`), il n'y avait aucune reprise
 * périodique du tout : l'envoi ne repartait qu'à l'événement `online`, que le système
 * n'émet pas quand la couverture revient par intermittence sur un lien déjà « connecté ».
 *
 * CE QUE CE MODULE POSE.
 *   1. une TEMPORISATION EXPONENTIELLE, plafonnée, avec bruit — pour espacer les
 *      tentatives quand le réseau reste absent, sans jamais dépasser un intervalle qui
 *      rendrait la reprise inutile ;
 *   2. un ARRÊT FRANC : quand il n'y a plus rien à tenter, on ne planifie plus rien ;
 *   3. une REMISE EN FILE bornée des échecs, pour qu'une coupure de session ou une panne
 *      passagère se rattrape seule, sans transformer un refus métier en boucle infinie.
 */

/** Premier intervalle : assez court pour que le retour du réseau se voie tout de suite. */
export const REPRISE_BASE_MS = 5_000;

/** Plafond : au-delà, on cesserait de reprendre à une cadence utile sur un chantier. */
export const REPRISE_PLAFOND_MS = 5 * 60_000;

/**
 * Intervalle avant la prochaine tentative, pour un cycle donné (0 = première reprise).
 *
 * Le bruit n'est pas cosmétique : plusieurs appareils qui retrouvent le réseau au même
 * instant — une équipe qui remonte du sous-sol — repartiraient sinon en phase et
 * frapperaient le serveur à la même seconde, à chaque cycle. On garde donc la moitié
 * basse de l'intervalle déterministe (pour que la cadence reste prévisible) et on tire
 * l'autre moitié au hasard.
 */
export function delaiReprise(cycle: number, alea: () => number = Math.random): number {
  const rang = Math.max(0, Math.floor(cycle));
  // 2^rang plafonné AVANT la multiplication : sans cela, un cycle élevé déborde.
  const facteur = Math.min(2 ** Math.min(rang, 20), REPRISE_PLAFOND_MS / REPRISE_BASE_MS);
  const plein = Math.min(REPRISE_PLAFOND_MS, REPRISE_BASE_MS * facteur);
  return Math.round(plein / 2 + alea() * (plein / 2));
}

/** Mutations qui partiront au prochain passage, sans aucun geste de l'utilisateur. */
export function pretesAEnvoyer(mutations: Mutation[]): Mutation[] {
  return mutations.filter((m) => m.etat === "en_attente");
}

/**
 * Échecs que la file a le droit de remettre en file toute seule.
 *
 * Le plafond de tentatives est ce qui distingue une panne d'un refus. Une session expirée
 * ou un réseau coupé se rattrapent en quelques reprises ; un refus métier — « cette
 * réserve n'est plus dans l'état attendu » — ne se rattrapera jamais, et doit s'arrêter
 * plutôt que de tourner. Les conflits, eux, ne sont pas ici : ils exigent une décision
 * humaine et la machine à états leur interdit déjà le retour en file.
 */
export function echecsRattrapables(mutations: Mutation[]): Mutation[] {
  return mutations.filter((m) => m.etat === "echec" && !doitAbandonner(m));
}

/**
 * Reste-t-il quelque chose que la reprise automatique puisse faire avancer ?
 *
 * C'est la question qui éteint la boucle. Une file où tout est synchronisé, annulé, en
 * conflit, ou définitivement abandonné n'a plus rien à attendre du réseau : continuer à
 * le sonder ne ferait que consommer de la batterie pour un résultat connu d'avance.
 */
export function repriseUtile(mutations: Mutation[]): boolean {
  return pretesAEnvoyer(mutations).length > 0 || echecsRattrapables(mutations).length > 0;
}

/**
 * Cycle suivant, selon ce que la tentative a produit.
 *
 * Un envoi qui a fait avancer quoi que ce soit remet le compteur à zéro : le réseau
 * répond, il n'y a aucune raison d'espacer. Sinon on monte d'un cran.
 */
export function cycleSuivant(cycle: number, progression: boolean): number {
  return progression ? 0 : Math.min(cycle + 1, 20);
}
