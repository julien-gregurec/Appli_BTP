import { hmacSha256, type ClientRateLimit } from "@/lib/security/rate-limit";

/**
 * Anti-bruteforce de la connexion par mot de passe (ELSATIA LOGIN RATE LIMIT
 * NAT / AGENCY HARDENING V1).
 *
 * On ne compte que les ÉCHECS d'identification, dans trois dimensions :
 *  - compte + IP : bruteforce d'un compte depuis un poste, sans pénaliser le
 *    titulaire qui se connecte depuis ailleurs ;
 *  - compte seul  : bruteforce distribué sur plusieurs IP (botnet) ;
 *  - IP seule     : pulvérisation de mots de passe / credential stuffing sur de
 *    nombreux comptes depuis une même IP, avec un budget assez large pour
 *    qu'une agence de 50 salariés derrière une même box ne soit pas bloquée
 *    par quelques fautes de frappe.
 * Chaque dimension a une fenêtre courte et une fenêtre longue (refroidissement
 * progressif : un attaquant patient qui attend la fin de la fenêtre courte
 * finit par tomber sur la fenêtre journalière).
 *
 * Un login réussi ne consomme aucun de ces budgets. Le plafond anti-flot par IP
 * de toutes les requêtes POST /login reste appliqué dans le proxy.
 *
 * Anti-énumération : les compteurs sont indexés par l'email SAISI (normalisé),
 * que le compte existe ou non ; le blocage est décidé AVANT d'appeler Supabase
 * Auth et produit le même message quel que soit le compte — un bon mot de passe
 * pendant un blocage est refusé comme un mauvais, sinon le blocage deviendrait
 * lui-même un oracle.
 */
export type DimensionEchecConnexion = "compte-ip" | "compte" | "ip";

export type PolitiqueEchecConnexion = {
  cle: string;
  dimension: DimensionEchecConnexion;
  maximum: number;
  fenetreSecondes: number;
};

export const POLITIQUES_ECHEC_CONNEXION: readonly PolitiqueEchecConnexion[] = [
  { cle: "auth:login:echec:compte-ip", dimension: "compte-ip", maximum: 5, fenetreSecondes: 900 },
  { cle: "auth:login:echec:compte-ip:jour", dimension: "compte-ip", maximum: 20, fenetreSecondes: 86_400 },
  { cle: "auth:login:echec:compte", dimension: "compte", maximum: 30, fenetreSecondes: 3_600 },
  { cle: "auth:login:echec:compte:jour", dimension: "compte", maximum: 100, fenetreSecondes: 86_400 },
  { cle: "auth:login:echec:ip", dimension: "ip", maximum: 150, fenetreSecondes: 900 },
  { cle: "auth:login:echec:ip:jour", dimension: "ip", maximum: 1_500, fenetreSecondes: 86_400 },
];

export const MESSAGE_CONNEXION_BLOQUEE = "Trop de tentatives de connexion. Réessayez dans quelques minutes.";
export const MESSAGE_CONNEXION_INDISPONIBLE = "Connexion momentanément indisponible. Réessayez dans un instant.";

export type DecisionConnexion =
  | { autorise: true }
  | { autorise: false; raison: "bloque"; reessayerApres: number; politique: PolitiqueEchecConnexion }
  | { autorise: false; raison: "indisponible" };

type EntreeConnexion = { email: string; ip: string; secret: string };

/** Email tel que Supabase Auth le compare : insensible à la casse et aux espaces. */
export function normaliserEmailConnexion(email: string) {
  return email.trim().toLowerCase();
}

function identitePour(dimension: DimensionEchecConnexion, email: string, ip: string) {
  if (dimension === "compte") return `login-compte:${email}`;
  if (dimension === "ip") return `login-ip:${ip}`;
  return `login-compte-ip:${email}|${ip}`;
}

async function hashes({ email, ip, secret }: EntreeConnexion) {
  const normalise = normaliserEmailConnexion(email);
  const dimensions: DimensionEchecConnexion[] = ["compte-ip", "compte", "ip"];
  const valeurs = await Promise.all(dimensions.map((d) => hmacSha256(identitePour(d, normalise, ip), secret)));
  return Object.fromEntries(dimensions.map((d, i) => [d, valeurs[i]])) as Record<DimensionEchecConnexion, string>;
}

type LigneRateLimit = { autorise?: boolean; restant?: number; reessayer_apres?: number } | null;

function ligne(data: unknown): LigneRateLimit {
  return (Array.isArray(data) ? data[0] : data) as LigneRateLimit;
}

function rpcPour(politique: PolitiqueEchecConnexion, hash: string) {
  return {
    p_cle: politique.cle,
    p_identifiant_hash: hash,
    p_fenetre_secondes: politique.fenetreSecondes,
    p_maximum: politique.maximum,
  };
}

/**
 * Lit les budgets d'échec sans les consommer. Un budget épuisé bloque la
 * tentative avant tout appel à Supabase Auth. Toute erreur du limiteur refuse
 * la connexion (fail closed, cohérent avec le proxy).
 */
export async function verifierBudgetConnexion(client: ClientRateLimit, entree: EntreeConnexion): Promise<DecisionConnexion> {
  try {
    const parDimension = await hashes(entree);
    const lectures = await Promise.all(
      POLITIQUES_ECHEC_CONNEXION.map((politique) => client.rpc("consulter_rate_limit", rpcPour(politique, parDimension[politique.dimension]))),
    );
    if (lectures.some(({ error }) => error)) return { autorise: false, raison: "indisponible" };

    const bloquantes = POLITIQUES_ECHEC_CONNEXION
      .map((politique, i) => ({ politique, resultat: ligne(lectures[i].data) }))
      .filter(({ resultat }) => !resultat?.autorise);
    if (!bloquantes.length) return { autorise: true };

    // La tentative refusée est comptée sur les budgets bloquants : la première
    // trace un événement dans journal_abus_securite (compteur = maximum + 1).
    await Promise.all(bloquantes.map(({ politique }) => client.rpc("consommer_rate_limit", rpcPour(politique, parDimension[politique.dimension]))));

    const pire = bloquantes.reduce((a, b) => (Number(b.resultat?.reessayer_apres) > Number(a.resultat?.reessayer_apres) ? b : a));
    return {
      autorise: false,
      raison: "bloque",
      reessayerApres: Math.max(1, Number(pire.resultat?.reessayer_apres) || 1),
      politique: pire.politique,
    };
  } catch {
    return { autorise: false, raison: "indisponible" };
  }
}

/** Consomme une unité de chaque budget après un échec d'identification. */
export async function enregistrerEchecConnexion(client: ClientRateLimit, entree: EntreeConnexion): Promise<{ enregistre: boolean }> {
  try {
    const parDimension = await hashes(entree);
    const resultats = await Promise.all(
      POLITIQUES_ECHEC_CONNEXION.map((politique) => client.rpc("consommer_rate_limit", rpcPour(politique, parDimension[politique.dimension]))),
    );
    return { enregistre: !resultats.some(({ error }) => error) };
  } catch {
    return { enregistre: false };
  }
}

/**
 * Seuls les refus d'identifiants comptent comme échec : une panne Auth, un
 * email non confirmé (bon mot de passe) ou une limite Supabase ne doivent pas
 * user le budget d'une agence.
 */
export function estEchecIdentifiants(erreur: { message?: string; code?: string } | null | undefined) {
  if (!erreur) return false;
  return erreur.code === "invalid_credentials" || /invalid login credentials/i.test(erreur.message ?? "");
}

/**
 * Journal structuré sans donnée personnelle : ni email, ni mot de passe, ni
 * jeton, ni IP en clair — seulement un préfixe de HMAC permettant de corréler
 * les événements d'une même identité.
 */
export async function journaliserConnexion(
  evenement: "auth.login.bloque" | "auth.login.echec_non_enregistre" | "auth.login.limiteur_indisponible",
  entree: EntreeConnexion,
  details: { politique?: string; reessayerApres?: number } = {},
) {
  let compte = "indisponible";
  let ip = "indisponible";
  try {
    const parDimension = await hashes(entree);
    compte = parDimension.compte.slice(0, 12);
    ip = parDimension.ip.slice(0, 12);
  } catch {
    // Journal best effort : ne jamais faire échouer la connexion pour un log.
  }
  console.warn(JSON.stringify({ evenement, compte, ip, ...details }));
}
