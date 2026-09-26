import {
  OFFRES_TARIFAIRES,
  offreTarifaireParCle,
  permissionEstPorteDEntreeModule,
  permissionIncluseDansOffre,
  type CodeOffreTarifaire,
} from "@/lib/tarification";

/**
 * SOCLE de l'essai — ELSATIA-GP-TRIAL-SOCLE-ACCESS-AND-CAPACITY-FIX-V1.
 *
 * Constat fermé ici (P0-1) : depuis ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1, une
 * entreprise en essai valide SANS `abonnement_offre` (l'état normal de toute
 * nouvelle entreprise) se voyait refuser /clients, /devis, /factures, /employes,
 * /planning et /messagerie. Cause exacte : `permissionEstPorteDEntreeModule`
 * range dans les « portes d'entrée de module » TOUTE permission figurant dans la
 * grille tarifaire — donc aussi le SOCLE — et aucun module `modules_gestion_pro`
 * de statut `actif` ne couvre ces permissions-là. La branche essai de
 * `acces_module_pour_permission` ne pouvait donc jamais les rattraper, et le
 * proxy renvoyait vers /abonnement/module-non-inclus une route pourtant visible
 * dans la navigation.
 *
 * Règle cible : LE SOCLE NE DÉPEND JAMAIS D'UNE LIGNE `modules_entreprises`.
 *
 * Définition du SOCLE : le périmètre fonctionnel de l'offre d'entrée de la
 * grille canonique (Mini), dérivé de `OFFRES_TARIFAIRES` — aucune liste codée en
 * dur, aucune divergence possible avec la grille commerciale. Ce choix est déjà
 * celui de la base pour l'essai : `capacite_personnes_base` (migration
 * 20260903000256) normalise une entreprise sans offre vers `mini`. L'essai donne
 * donc exactement le périmètre Mini — ni plus (les modules optionnels restent
 * gouvernés par le catalogue et `modules_entreprises`), ni moins.
 *
 * Aucune migration : ce module ne fait qu'aligner le contrat applicatif du proxy
 * sur le contrat déjà porté par la base.
 */

/** Offre d'entrée dont le périmètre fait office de SOCLE (cf. capacite_personnes_base). */
export const OFFRE_SOCLE: CodeOffreTarifaire = "mini";

/** Durée de l'essai en jours calendaires, alignée sur la migration 20260905000265. */
export const DUREE_ESSAI_JOURS = 30;

/** Permissions du SOCLE, dérivées de la grille canonique (jamais codées en dur). */
export const PERMISSIONS_SOCLE: readonly string[] = [...offreTarifaireParCle(OFFRE_SOCLE).fonctionnalites];

const SOCLE = new Set(PERMISSIONS_SOCLE);

/** Vrai si la permission appartient au SOCLE (accessible dès l'essai, sans module). */
export function permissionEstSocle(permission: string): boolean {
  return SOCLE.has(permission);
}

/**
 * Permissions réellement gouvernées par un module optionnel / un palier
 * supérieur : tout ce que la grille limite hors du SOCLE. Sert à documenter et à
 * tester la frontière ; le contrôle d'accès reste celui du catalogue.
 */
export const PERMISSIONS_HORS_SOCLE: readonly string[] = [
  ...new Set(OFFRES_TARIFAIRES.flatMap((offre) => [...offre.fonctionnalites])),
].filter((permission) => !SOCLE.has(permission)).sort();

/** Ajoute `jours` jours calendaires à une date ISO (YYYY-MM-DD), en UTC. */
function ajouterJoursIso(dateIso: string, jours: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + jours);
  return date.toISOString().slice(0, 10);
}

export type FenetreEssai = {
  abonnementStatut: string | null | undefined;
  essaiDebut: string | null | undefined;
  essaiFin: string | null | undefined;
};

/**
 * Fin d'essai effective : `abonnement_essai_fin` fait autorité ; à défaut
 * `abonnement_essai_debut + 30 jours`. `null` = fenêtre inconnue, jamais une
 * fenêtre expirée (même repli défensif que `getContexteEntreprise`, qui ne
 * déclare `essaiExpireSansOffre` que lorsqu'une fin est calculable).
 */
export function finEssaiEffective(fenetre: FenetreEssai): string | null {
  if (fenetre.essaiFin) return fenetre.essaiFin;
  if (fenetre.essaiDebut) return ajouterJoursIso(fenetre.essaiDebut, DUREE_ESSAI_JOURS);
  return null;
}

/**
 * Vrai si l'entreprise est dans une fenêtre d'essai non expirée. Un essai dont
 * la fenêtre n'est pas calculable est considéré en cours (jamais expiré par
 * défaut), pour ne retirer aucun accès existant.
 */
export function essaiEnCours(fenetre: FenetreEssai, maintenant: Date = new Date()): boolean {
  if (fenetre.abonnementStatut !== "essai") return false;
  const fin = finEssaiEffective(fenetre);
  if (!fin) return true;
  return new Date(`${fin}T23:59:59.999Z`).getTime() >= maintenant.getTime();
}

export type EtatAbonnementSocle = FenetreEssai & {
  abonnementOffre: string | null | undefined;
};

/**
 * Décision centrale du SOCLE : cette permission est-elle ouverte à l'entreprise
 * SANS aucun entitlement module ?
 *
 * - offre souscrite → non concerné (la garde de plan `permissionIncluseDansOffre`
 *   fait foi, comportement strictement inchangé pour tout abonné) ;
 * - pas d'offre + essai en cours + permission du SOCLE → OUI ;
 * - pas d'offre + essai expiré ou statut autre → NON (on retombe sur
 *   l'entitlement module, exactement comme aujourd'hui).
 *
 * N'enlève jamais un accès : le proxy l'évalue en OU avec les contrôles existants.
 */
export function socleOuvertPendantEssai(
  permission: string,
  etat: EtatAbonnementSocle,
  maintenant: Date = new Date(),
): boolean {
  if (etat.abonnementOffre) return false;
  if (!permissionEstSocle(permission)) return false;
  return essaiEnCours(etat, maintenant);
}

/**
 * Décision CENTRALE de la garde d'accès du proxy, hors entitlement module.
 *
 * Répond à : « ce droit est-il ouvert sans consulter `modules_entreprises` ? »
 *
 *  1. SOCLE + essai valide sans offre  → OUI (correctif P0-1) ;
 *  2. offre souscrite                  → règle de plan inchangée
 *                                        (`permissionIncluseDansOffre`) ;
 *  3. sans offre, hors SOCLE           → NON : porte d'entrée de module, seul
 *                                        l'entitlement (achat, offert, essai
 *                                        catalogue) peut l'ouvrir — contrat
 *                                        ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1
 *                                        strictement préservé.
 *
 * Le proxy évalue ensuite `acces_module_pour_permission` en OU : cette fonction
 * n'enlève donc jamais un accès, elle en ajoute un.
 */
export function droitOuvertSansModule(
  droit: string,
  etat: EtatAbonnementSocle,
  maintenant: Date = new Date(),
): boolean {
  if (socleOuvertPendantEssai(droit, etat, maintenant)) return true;
  const offre = etat.abonnementOffre ?? null;
  const offreCouvreDroit = (!offre && !permissionEstPorteDEntreeModule(droit)) || Boolean(offre);
  return offreCouvreDroit && permissionIncluseDansOffre(droit, offre);
}

/* ────────────────────────────────────────────────────────────────────────────
 * SORTIE D'ESSAI — ELSATIA-GP-TRIAL-EXPIRY-P1-CLOSURE-V1
 *
 * L'essai expiré bloque le métier ; il ne doit jamais enfermer le client. Trois
 * droits restent ouverts après J30, indépendamment de toute offre :
 *   — demander de l'aide (support) ;
 *   — récupérer ses données (export RGPD, droit à la portabilité) ;
 *   — souscrire (sortie payante).
 *
 * Ce contrat est déclaré ICI, pas dans `getContexteEntreprise`, pour être
 * testable sans base ni requête et pour rester la source unique de la frontière.
 * Il n'ouvre AUCUNE permission : la garde de module du proxy et les droits de
 * rôle restent évalués exactement comme avant. Il ne fait que lever la
 * redirection vers /abonnement-suspendu sur ces chemins précis.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Chemins restant accessibles après expiration de l'essai. Volontairement
 * énumérés un par un, jamais un préfixe large :
 *
 *  - `/abonnement`        souscrire ;
 *  - `/aide`              messagerie de support + FAQ ;
 *  - `/parametres/donnees` page RGPD (export + suppression), et RIEN d'autre
 *                          sous /parametres — les réglages métier restent fermés ;
 *  - `/api/rgpd/export`   téléchargement effectif de l'export RGPD.
 *
 * `/abonnement/module-non-inclus` n'y figure volontairement PAS : après J30 son
 * message (« module optionnel non compris dans l'essai ») serait faux, et
 * l'utilisateur doit voir /abonnement-suspendu?motif=essai_expire, qui dit la
 * vérité et propose les trois sorties.
 */
export const CHEMINS_ACCESSIBLES_ESSAI_EXPIRE: readonly string[] = [
  "/abonnement",
  "/aide",
  "/parametres/donnees",
  "/api/rgpd/export",
];

/**
 * Vrai si ce chemin fait partie de la sortie d'essai. Égalité EXACTE (au slash
 * final près), jamais un préfixe : ouvrir `/parametres/donnees` n'ouvre donc
 * aucune autre page de /parametres, et `/abonnement-suspendu` comme
 * `/abonnement/module-non-inclus` restent en dehors. Toute nouvelle sortie doit
 * être ajoutée explicitement à la liste ci-dessus.
 */
export function cheminAccessibleEssaiExpire(chemin: string | null | undefined): boolean {
  if (!chemin) return false;
  const normalise = chemin.length > 1 && chemin.endsWith("/") ? chemin.slice(0, -1) : chemin;
  return CHEMINS_ACCESSIBLES_ESSAI_EXPIRE.includes(normalise);
}

/**
 * Jours calendaires restants avant la fin de l'essai (0 = dernier jour, l'essai
 * courant encore jusqu'à 23:59:59 UTC). `null` si l'entreprise n'est pas en
 * essai, si la fenêtre est inconnue, ou si l'essai est déjà expiré.
 */
export function joursRestantsEssai(fenetre: FenetreEssai, maintenant: Date = new Date()): number | null {
  if (fenetre.abonnementStatut !== "essai") return null;
  const fin = finEssaiEffective(fenetre);
  if (!fin) return null;
  const finMs = new Date(`${fin}T23:59:59.999Z`).getTime();
  if (finMs < maintenant.getTime()) return null;
  const jourCourant = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  const jourFin = new Date(`${fin}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((jourFin - jourCourant) / 86_400_000));
}

/** Paliers de préavis demandés au contrat : J-7, J-3, J-1. */
export const PALIERS_PREAVIS_ESSAI = [7, 3, 1] as const;

export type NiveauPreavisEssai = "info" | "attention" | "urgent";

export type PreavisEssai = {
  joursRestants: number;
  /** Palier atteint (7, 3 ou 1) : le plus proche palier ≥ joursRestants. */
  palier: (typeof PALIERS_PREAVIS_ESSAI)[number];
  niveau: NiveauPreavisEssai;
};

/**
 * Préavis de fin d'essai, ou `null` s'il n'y a rien à annoncer.
 *
 * Le contrat demande J-7, J-3 et J-1. Un préavis affiché UNIQUEMENT ces trois
 * jours-là serait invisible pour un client qui ne se connecte pas précisément
 * ce jour : le bandeau reste donc affiché en continu dès J-7, en changeant de
 * niveau aux paliers demandés (7→4 « info », 3→2 « attention », 1→0 « urgent »).
 * Aucune notification poussée, aucun envoi : affichage local uniquement.
 */
export function preavisEssai(fenetre: FenetreEssai, maintenant: Date = new Date()): PreavisEssai | null {
  const joursRestants = joursRestantsEssai(fenetre, maintenant);
  if (joursRestants === null || joursRestants > PALIERS_PREAVIS_ESSAI[0]) return null;
  // Palier atteint = le plus petit seuil encore ≥ au reste à courir : J-5 est
  // toujours dans le palier « 7 », J-2 dans le palier « 3 », J-0 dans « 1 ».
  const palier = [...PALIERS_PREAVIS_ESSAI].reverse().find((seuil) => seuil >= joursRestants) ?? PALIERS_PREAVIS_ESSAI[0];
  const niveau: NiveauPreavisEssai = palier === 1 ? "urgent" : palier === 3 ? "attention" : "info";
  return { joursRestants, palier, niveau };
}
