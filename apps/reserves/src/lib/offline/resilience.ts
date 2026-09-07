/**
 * Résilience réseau du terrain — ce que le lot livre RÉELLEMENT.
 *
 * ⚠️ ELSATIA Réserves n'est PAS une application hors-ligne. Mesuré au navigateur
 * (`tests/e2e/reserves-v4-offline-mobile.spec.ts`) : sans réseau, aucune page ne se
 * charge ni ne se recharge, aucun service worker n'est enregistré, aucun cache local
 * n'existe. Consulter un chantier déjà ouvert, saisir un brouillon ou joindre une photo
 * hors connexion est aujourd'hui IMPOSSIBLE, et ce module ne le rend pas possible.
 *
 * Ce qu'il traite est le problème voisin, celui qui se pose tous les jours sur un
 * chantier : un réseau qui FLANCHE. Une soumission part, la réponse n'arrive pas,
 * l'utilisateur réessaie — et la réserve est créée deux fois. La base sait déjà s'en
 * prémunir (`reserves.origine_client_id`, index unique par organisation, et
 * `reserves_creer()` qui renvoie la réserve existante au rejeu) : ce qui manquait, c'est
 * que le CLIENT émette réellement cette clé. Sans elle, la protection est du code mort.
 */

/** Format attendu par la base : la colonne `origine_client_id` est un uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function estCleIdempotence(valeur: unknown): valeur is string {
  return typeof valeur === "string" && UUID.test(valeur);
}

/**
 * Clé d'idempotence d'une saisie. Elle identifie L'INTENTION de l'utilisateur, pas la
 * requête : elle doit donc rester stable d'une tentative à l'autre, et ne changer qu'au
 * début d'une nouvelle saisie.
 */
export function nouvelleCleIdempotence(): string {
  // `randomUUID` exige un contexte sécurisé ; en clair (recette locale en http), on
  // retombe sur `getRandomValues`, qui est disponible partout et tout aussi imprévisible.
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  octets[6] = (octets[6] & 0x0f) | 0x40;
  octets[8] = (octets[8] & 0x3f) | 0x80;
  const hex = [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * États d'une saisie en attente d'acquittement. Le vocabulaire est fixé ici pour que
 * l'écran, les journaux et une future file locale parlent de la même chose.
 */
export const ETATS_SYNCHRO = ["en_attente", "en_cours", "synchronise", "echec"] as const;
export type EtatSynchro = (typeof ETATS_SYNCHRO)[number];

export const LIBELLES_ETAT_SYNCHRO: Record<EtatSynchro, string> = {
  en_attente: "En attente d’envoi",
  en_cours: "Envoi en cours",
  synchronise: "Envoyé",
  echec: "Échec — à renvoyer",
};

/** Seul un échec se rejoue, et jamais automatiquement : la reprise reste un geste. */
export function peutReessayer(etat: EtatSynchro): boolean {
  return etat === "echec";
}

/**
 * Politique de conflit, par nature de donnée.
 *
 * Le principe : plus une donnée engage juridiquement, moins le client a le droit de
 * l'écraser. Une levée validée est un ACQUITTEMENT — la reprendre en silence ferait
 * disparaître une décision contradictoire prise entre deux entreprises.
 */
export const POLITIQUES_CONFLIT = {
  /** Le workflow appartient à la base : la matrice de transitions tranche, pas le client. */
  statut_reserve: "serveur_gagne",
  /** Une levée déjà validée n'est JAMAIS réécrite sans arbitrage humain explicite. */
  levee_validee: "conflit_manuel",
  /** Le constat de terrain vient du terrain : c'est la saisie locale qui fait foi. */
  description_saisie_terrain: "client_gagne",
  /** Une photo ne s'écrase pas : deux clichés sont deux faits, on les garde tous les deux. */
  photo: "client_gagne",
  /** L'historique est immuable et append-only : rien ne s'y écrase, jamais. */
  historique: "serveur_gagne",
} as const;

export type NatureDonnee = keyof typeof POLITIQUES_CONFLIT;
export type PolitiqueConflit = (typeof POLITIQUES_CONFLIT)[NatureDonnee];

export function politiquePour(nature: NatureDonnee): PolitiqueConflit {
  return POLITIQUES_CONFLIT[nature];
}

/**
 * Garde-fou explicite, indépendant de l'appelant : aucune reprise de saisie locale ne
 * peut effacer une levée déjà validée. La base l'interdit déjà (la matrice de
 * transitions n'autorise pas `levee → *` sans réouverture motivée) ; on le redit ici pour
 * qu'une future file de synchronisation ne puisse pas l'ignorer par omission.
 */
export function ecrasementAutorise(nature: NatureDonnee, statutServeur: string): boolean {
  if (statutServeur === "levee") return false;
  return politiquePour(nature) === "client_gagne";
}
