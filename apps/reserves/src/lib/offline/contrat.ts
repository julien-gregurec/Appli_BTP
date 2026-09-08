/**
 * Contrat de la file de mutations hors-ligne — module PUR.
 *
 * Aucun accès au réseau, à IndexedDB ni au DOM : tout ce qui décide (états, transitions,
 * éligibilité au rejeu, classement d'une réponse serveur) est ici, donc testable sans
 * navigateur. Les modules qui touchent réellement au stockage n'y ajoutent aucune règle.
 */

/** Format des clés d'idempotence : la base attend des uuid. */
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

// ── États ────────────────────────────────────────────────────────────────────

export const ETATS_MUTATION = [
  "brouillon",    // saisi, pas encore soumis par l'utilisateur
  "en_attente",   // soumis, attend le réseau
  "en_cours",     // envoi en cours
  "synchronise",  // acquitté par le serveur
  "echec",        // erreur transitoire ou refus : rejouable
  "conflit",      // l'état serveur a changé : exige un arbitrage humain
  "annule",       // retiré par l'utilisateur avant envoi
] as const;
export type EtatMutation = (typeof ETATS_MUTATION)[number];

export const LIBELLES_ETAT: Record<EtatMutation, string> = {
  brouillon: "Brouillon",
  en_attente: "En attente d’envoi",
  en_cours: "Envoi en cours",
  synchronise: "Envoyé",
  echec: "Échec — à renvoyer",
  conflit: "Conflit — à arbitrer",
  annule: "Annulé",
};

/** Seuls ces états comptent comme « travail non transmis » dans les compteurs d'écran. */
export const ETATS_EN_SUSPENS: readonly EtatMutation[] = [
  "brouillon", "en_attente", "en_cours", "echec", "conflit",
];

export function estEnSuspens(etat: EtatMutation): boolean {
  return ETATS_EN_SUSPENS.includes(etat);
}

/**
 * Transitions autorisées de la file.
 *
 * Le point important est ce qui est ABSENT : rien ne mène de `synchronise` ou de
 * `conflit` vers `en_attente`. Une mutation acquittée ne peut donc pas être renvoyée par
 * une boucle de reprise, et un conflit ne peut pas être « réessayé » comme s'il
 * s'agissait d'une panne réseau — il exige une décision.
 */
const TRANSITIONS: Record<EtatMutation, readonly EtatMutation[]> = {
  brouillon: ["en_attente", "annule"],
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

// ── Types de mutation réellement pris en charge ──────────────────────────────
//
// Cette liste est FERMÉE, et volontairement courte : elle ne contient que ce qui est
// réellement éprouvé en navigateur, hors ligne, par la recette. Une action absente d'ici
// n'est pas proposée hors ligne plutôt que d'être proposée puis perdue.

export const TYPES_MUTATION = [
  "reserve_creer",
  "commentaire_ajouter",
  "photo_ajouter",
  "levee_demander",
] as const;
export type TypeMutation = (typeof TYPES_MUTATION)[number];

export const LIBELLES_TYPE: Record<TypeMutation, string> = {
  reserve_creer: "Création de réserve",
  commentaire_ajouter: "Commentaire",
  photo_ajouter: "Photo",
  levee_demander: "Demande de levée",
};

/** Version du format de charge utile, pour qu'une file ancienne reste interprétable. */
export const VERSION_PAYLOAD = 1;

export type Mutation = {
  /** Identifiant client stable — sert aussi de clé d'idempotence envoyée au serveur. */
  id: string;
  type: TypeMutation;
  etat: EtatMutation;
  /** Cloisonnement : l'organisation et l'utilisateur qui ONT PRÉPARÉ la mutation. */
  entrepriseId: string;
  utilisateurId: string;
  /** Réserve visée ; absente pour une création. */
  reserveId: string | null;
  chantierId: string | null;
  version: number;
  payload: Record<string, unknown>;
  /** Date locale de saisie — l'appareil peut être désynchronisé, on ne s'y fie pas. */
  creeeA: string;
  modifieeA: string;
  tentatives: number;
  derniereErreur: string | null;
  /** Renseigné quand le serveur a tranché : identifiant réel de l'objet créé. */
  identifiantServeur: string | null;
};

export type BrouillonMutation = Omit<
  Mutation, "id" | "etat" | "creeeA" | "modifieeA" | "tentatives" | "derniereErreur"
  | "identifiantServeur" | "version"
>;

export function creerMutation(
  brouillon: BrouillonMutation,
  options: { etat?: EtatMutation; maintenant?: Date; id?: string } = {},
): Mutation {
  const instant = (options.maintenant ?? new Date()).toISOString();
  return {
    id: options.id ?? nouvelleCle(),
    etat: options.etat ?? "brouillon",
    version: VERSION_PAYLOAD,
    creeeA: instant,
    modifieeA: instant,
    tentatives: 0,
    derniereErreur: null,
    identifiantServeur: null,
    ...brouillon,
  };
}

// ── Cloisonnement ────────────────────────────────────────────────────────────

/**
 * Une mutation n'est envoyable QUE sous l'identité qui l'a préparée.
 *
 * C'est la garantie centrale du lot : une action saisie par A sur un chantier de
 * l'organisation X ne doit jamais partir sous la session de B, ni sous l'organisation Y.
 * Le cloisonnement est déjà assuré par le nom de la base locale (une identité = une base),
 * mais on le revérifie ici avant CHAQUE envoi : une base ouverte par erreur, un compte
 * changé dans un autre onglet, et la vérification par le nom ne suffirait plus.
 */
export function envoyableSous(
  mutation: Pick<Mutation, "entrepriseId" | "utilisateurId">,
  identite: { entrepriseId: string | null; utilisateurId: string | null },
): boolean {
  return (
    identite.entrepriseId !== null
    && identite.utilisateurId !== null
    && mutation.entrepriseId === identite.entrepriseId
    && mutation.utilisateurId === identite.utilisateurId
  );
}

/** Mutations réellement prêtes à partir, dans l'ordre où elles ont été saisies. */
export function aEnvoyer(
  mutations: Mutation[],
  identite: { entrepriseId: string | null; utilisateurId: string | null },
): Mutation[] {
  return mutations
    .filter((m) => m.etat === "en_attente" && envoyableSous(m, identite))
    .sort((a, b) => a.creeeA.localeCompare(b.creeeA));
}

// ── Classement des réponses serveur ──────────────────────────────────────────

/** Plafond de reprises automatiques : au-delà, la file cesse d'insister toute seule. */
export const TENTATIVES_MAX = 5;

export type IssueServeur =
  | { issue: "applique"; identifiant: string | null }
  | { issue: "rejeu"; identifiant: string | null }
  | { issue: "conflit"; motif: string }
  | { issue: "refus"; motif: string }
  | { issue: "reseau"; motif: string };

/**
 * État d'arrivée d'une mutation selon la réponse et le nombre de tentatives déjà faites.
 *
 * Trois principes :
 *
 *  — un REJEU vaut un succès : c'est la réponse normale quand le premier envoi a abouti
 *    mais que son accusé s'est perdu. Le présenter comme un échec pousserait à ressaisir
 *    une action déjà enregistrée ;
 *
 *  — une panne RÉSEAU est transitoire par nature : la mutation retourne en file et
 *    repartira seule, jusqu'au plafond de tentatives. Exiger un clic pour se remettre
 *    d'une coupure de trente secondes serait absurde sur un chantier ;
 *
 *  — un REFUS métier, lui, ne se répare pas tout seul : il attend une décision.
 */
export function etatApresReponse(reponse: IssueServeur, tentatives = 0): EtatMutation {
  switch (reponse.issue) {
    case "applique":
    case "rejeu":
      return "synchronise";
    case "conflit":
      return "conflit";
    case "refus":
      return "echec";
    case "reseau":
      return tentatives >= TENTATIVES_MAX ? "echec" : "en_attente";
  }
}

export function doitAbandonner(mutation: Pick<Mutation, "tentatives">): boolean {
  return mutation.tentatives >= TENTATIVES_MAX;
}

// ── Politique de conflit ─────────────────────────────────────────────────────

export const POLITIQUES_CONFLIT = {
  statut_reserve: "serveur_gagne",
  levee_validee: "conflit_manuel",
  description_saisie_terrain: "client_gagne",
  photo: "client_gagne",
  historique: "serveur_gagne",
} as const;

export type NatureDonnee = keyof typeof POLITIQUES_CONFLIT;
export type PolitiqueConflit = (typeof POLITIQUES_CONFLIT)[NatureDonnee];

export function politiquePour(nature: NatureDonnee): PolitiqueConflit {
  return POLITIQUES_CONFLIT[nature];
}

/**
 * Garde-fou d'écrasement. Une réserve levée côté serveur n'est jamais réécrite par une
 * action préparée hors ligne, quelle que soit la nature de la donnée : la levée est un
 * acquittement contradictoire entre deux entreprises, pas une valeur parmi d'autres.
 */
export function ecrasementAutorise(nature: NatureDonnee, statutServeur: string): boolean {
  if (statutServeur === "levee") return false;
  return politiquePour(nature) === "client_gagne";
}
