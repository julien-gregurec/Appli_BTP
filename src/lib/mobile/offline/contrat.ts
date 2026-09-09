/**
 * Contrat de la file de mutations hors-ligne de Gestion Pro — module PUR.
 *
 * Aucun accès au réseau, à IndexedDB ni au DOM. Tout ce qui DÉCIDE — états, transitions,
 * éligibilité au rejeu, classement d'une réponse serveur — vit ici, donc s'éprouve sans
 * navigateur. Les modules qui touchent réellement au stockage n'ajoutent aucune règle.
 *
 * ── Parenté avec Réserves, et ce qui n'en est pas repris ────────────────────────────────
 *
 * ELSATIA Réserves possède déjà un moteur hors-ligne éprouvé (`apps/reserves/src/lib/offline`).
 * Son code n'est PAS partagé ici, et ce n'est pas un oubli :
 *
 *   — Réserves est une application autonome dont la V6 vient d'être recettée. En extraire le
 *     cœur pour le mutualiser la modifierait au bénéfice d'un lot qui ne la concerne pas ;
 *     le risque est asymétrique.
 *   — Les charges utiles n'ont rien en commun. Réserves synchronise des réserves de chantier
 *     avec photos et annotations de plan ; Gestion Pro synchronise des sessions de pointage
 *     GPS et des brouillons de notes de frais. Une abstraction commune serait une abstraction
 *     vide, et une abstraction vide coûte plus cher qu'une répétition assumée.
 *
 * Ce qui est repris, en revanche, l'est délibérément : le vocabulaire d'états, la table de
 * transitions, et surtout ce qu'elle INTERDIT.
 */

/** Les identifiants sont des uuid : c'est ce que la base attend en clé primaire. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function estCleIdempotence(valeur: unknown): valeur is string {
  return typeof valeur === "string" && UUID.test(valeur);
}

export function nouvelleCle(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  octets[6] = (octets[6] & 0x0f) | 0x40;
  octets[8] = (octets[8] & 0x3f) | 0x80;
  const hex = [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── Types de mutation ────────────────────────────────────────────────────────
//
// Strictement le périmètre V1 terrain arbitré. Toute extension doit passer par une
// décision explicite : une file qui accepte « tout » finit par transporter des gestes
// dont personne n'a vérifié qu'ils supportent d'être rejoués.

export const TYPES_MUTATION = ["pointage_arrivee", "pointage_depart", "note_frais_brouillon"] as const;
export type TypeMutation = (typeof TYPES_MUTATION)[number];

export function estTypeMutation(valeur: unknown): valeur is TypeMutation {
  return typeof valeur === "string" && (TYPES_MUTATION as readonly string[]).includes(valeur);
}

/** Version du format de charge utile, écrite par l'appareil. Un appareil resté hors ligne
 *  une semaine peut rejouer une charge produite par une version antérieure de l'application. */
export const VERSION_PAYLOAD = 1;

// ── États ────────────────────────────────────────────────────────────────────

export const ETATS_MUTATION = [
  "en_attente",   // soumis par l'utilisateur, attend le réseau
  "en_cours",     // envoi en cours
  "synchronise",  // acquitté par le serveur
  "echec",        // erreur transitoire ou refus : rejouable sur geste
  "conflit",      // l'état serveur a changé : exige un arbitrage humain
  "annule",       // retiré par l'utilisateur avant envoi
] as const;
export type EtatMutation = (typeof ETATS_MUTATION)[number];

export const LIBELLES_ETAT: Record<EtatMutation, string> = {
  en_attente: "En attente d’envoi",
  en_cours: "Envoi en cours",
  synchronise: "Envoyé",
  echec: "Échec — à renvoyer",
  conflit: "Conflit — à arbitrer",
  annule: "Annulé",
};

/** Seuls ces états comptent comme « travail non transmis » dans les compteurs d'écran. */
export const ETATS_EN_SUSPENS: readonly EtatMutation[] = ["en_attente", "en_cours", "echec", "conflit"];

export function estEnSuspens(etat: EtatMutation): boolean {
  return ETATS_EN_SUSPENS.includes(etat);
}

/**
 * Transitions autorisées.
 *
 * L'important est ce qui est ABSENT. Rien ne mène de `synchronise` ou de `conflit` vers
 * `en_attente` : une mutation acquittée ne peut donc pas être renvoyée par une boucle de
 * reprise, et un conflit ne peut pas être « réessayé » comme s'il s'agissait d'une panne
 * réseau — il exige une décision.
 *
 * Sans cette table, un pointage d'arrivée acquitté puis remis en file par une reprise
 * maladroite produirait une seconde session ouverte pour le même salarié.
 */
const TRANSITIONS: Record<EtatMutation, readonly EtatMutation[]> = {
  en_attente: ["en_cours", "annule"],
  // `en_cours → en_attente` : un envoi interrompu par le réseau retourne en file de
  // lui-même. Sans ce chemin, une coupure passagère exigerait un geste humain pour
  // repartir, alors qu'elle se résout seule dès que la liaison revient.
  en_cours: ["synchronise", "en_attente", "echec", "conflit"],
  echec: ["en_attente", "annule"],
  conflit: ["annule"],
  synchronise: [],
  annule: [],
};

export function transitionAutorisee(avant: EtatMutation, apres: EtatMutation): boolean {
  return TRANSITIONS[avant].includes(apres);
}

/** Le rejeu est un GESTE : jamais une boucle automatique sur un conflit. */
export function peutReessayer(etat: EtatMutation): boolean {
  return etat === "echec";
}

export function peutAnnuler(etat: EtatMutation): boolean {
  return transitionAutorisee(etat, "annule");
}

// ── Forme d'une mutation en file ─────────────────────────────────────────────

export type MutationLocale = {
  /** Clé d'idempotence ET clé primaire de la ligne créée côté serveur. */
  id: string;
  type: TypeMutation;
  /** Identité qui a PRÉPARÉ la mutation. Vérifiée au rejeu, jamais déduite de la session. */
  entrepriseId: string;
  utilisateurId: string;
  /** Horloge de l'appareil au moment du geste — le fait métier, pas l'heure de transmission. */
  capteA: number;
  etat: EtatMutation;
  tentatives: number;
  version: number;
  payload: Record<string, unknown>;
  /** Dernier motif d'échec ou de conflit, tel qu'il sera montré à l'utilisateur. */
  motif?: string;
};

// ── Classement d'une réponse serveur ─────────────────────────────────────────

export type IssueServeur = "applique" | "rejeu" | "conflit" | "refus" | "indisponible";

/**
 * État résultant d'une issue serveur.
 *
 * `applique` et `rejeu` mènent au MÊME état. C'est le cœur de l'idempotence : du point de
 * vue de l'appareil, « le serveur vient de l'enregistrer » et « le serveur l'avait déjà
 * enregistré » sont le même succès. Les distinguer conduirait à rejouer indéfiniment une
 * mutation dont la première réponse s'est perdue sur le réseau — exactement le cas que la
 * file existe pour traiter.
 */
export function etatApresReponse(issue: IssueServeur): EtatMutation {
  switch (issue) {
    case "applique":
    case "rejeu":
      return "synchronise";
    case "conflit":
      return "conflit";
    case "refus":
      return "echec";
    case "indisponible":
      // Le service n'a pas répondu : ce n'est PAS un refus. Retourner en file plutôt que
      // marquer un échec évite d'exiger un geste humain pour une coupure de trois secondes.
      return "en_attente";
  }
}

/**
 * Une mutation peut-elle partir sous la session courante ?
 *
 * Règle absolue : une mutation préparée par A ne part JAMAIS sous B, même si la file de A
 * se retrouvait ouverte dans la session de B. Le cas n'est pas théorique — c'est le
 * téléphone de chantier que deux salariés se passent dans la journée.
 *
 * La base impose déjà cette règle (`cree_par_utilisateur_id = auth.uid()` en RLS sur les
 * notes de frais, `peut_pointer_pour_employe` sur les sessions). On la vérifie malgré tout
 * ici : une barrière qui échoue en clair, tôt, vaut mieux qu'un refus de RLS opaque que
 * l'utilisateur lira comme une panne.
 */
export function peutPartirSous(
  mutation: Pick<MutationLocale, "entrepriseId" | "utilisateurId">,
  session: { entrepriseId: string; utilisateurId: string },
): boolean {
  return mutation.entrepriseId === session.entrepriseId
    && mutation.utilisateurId === session.utilisateurId;
}

/**
 * Délai avant nouvelle tentative, en millisecondes.
 *
 * Croissance exponentielle plafonnée à cinq minutes. Le plafond compte autant que la
 * croissance : sans lui, un appareil resté hors ligne une nuit attendrait des heures avant
 * de retenter, alors que le réseau est revenu depuis longtemps.
 */
export function delaiAvantNouvelleTentative(tentatives: number): number {
  const base = 2_000 * 2 ** Math.max(0, tentatives - 1);
  return Math.min(base, 5 * 60_000);
}
