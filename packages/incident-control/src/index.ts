/**
 * ELSATIA — mode sûr (incident) : logique PURE partagée par les proxys des applications.
 *
 * L'AUTORITÉ EST LA BASE (migration `20260928000701_incident_safe_mode_v1`) : ses gardes refusent
 * les écritures quel que soit le chemin. Ce module ne fait que :
 *   • lire l'instantané public `incident_etat_public()` (drapeaux + statuts, jamais de motif) avec
 *     un cache court, sans dépendre d'un client Supabase ;
 *   • décider, pour une requête HTTP, s'il faut répondre 503 AVANT de toucher la base (coupure
 *     d'application, exports, paiements, liens publics : ce que la base ne voit pas toujours) ;
 *   • reconnaître un refus « mode sûr » renvoyé par la base, pour l'expliquer honnêtement ;
 *   • agréger des contrôles de santé en une réponse publique sans secret.
 *
 * Aucune dépendance : importable par tous les proxys (runtime Edge/Node) et par les tests.
 */

export const APPLICATIONS_INCIDENT = ["gestion_pro", "reserves", "tools", "colors", "studio"] as const;
export type ApplicationIncident = (typeof APPLICATIONS_INCIDENT)[number];
export type PorteeIncident = "global" | ApplicationIncident;

export const CONTROLES_INCIDENT = [
  "lecture_seule",
  "app_coupee",
  "uploads",
  "exports",
  "paiements",
  "invitations",
  "liens_publics",
  "reconciliation_stripe_requise",
] as const;
export type ControleIncident = (typeof CONTROLES_INCIDENT)[number];

export const STATUTS_SERVICE = ["OPERATIONAL", "DEGRADED", "READ_ONLY", "OUTAGE"] as const;
export type StatutService = (typeof STATUTS_SERVICE)[number];

export type EtatIncident = {
  generation: number;
  controles: ReadonlyArray<{ portee: PorteeIncident; controle: ControleIncident }>;
  statuts: Readonly<Record<string, { statut: StatutService; message: string | null }>>;
};

export const ETAT_NOMINAL: EtatIncident = Object.freeze({ generation: 0, controles: [], statuts: {} });

const estPortee = (v: unknown): v is PorteeIncident =>
  v === "global" || (APPLICATIONS_INCIDENT as readonly unknown[]).includes(v);
const estControle = (v: unknown): v is ControleIncident => (CONTROLES_INCIDENT as readonly unknown[]).includes(v);
const estStatut = (v: unknown): v is StatutService => (STATUTS_SERVICE as readonly unknown[]).includes(v);

/**
 * Valide strictement la réponse de `incident_etat_public()`. Toute valeur inconnue est ignorée
 * (jamais interprétée) ; une forme illisible rend `null` (état inconnu).
 */
export function analyserEtatIncident(brut: unknown): EtatIncident | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const objet = brut as Record<string, unknown>;
  if (!Array.isArray(objet.controles)) return null;
  const controles = objet.controles.flatMap((ligne) => {
    if (!ligne || typeof ligne !== "object") return [];
    const { portee, controle } = ligne as Record<string, unknown>;
    return estPortee(portee) && estControle(controle) ? [{ portee, controle }] : [];
  });
  const statuts: Record<string, { statut: StatutService; message: string | null }> = {};
  if (objet.statuts && typeof objet.statuts === "object" && !Array.isArray(objet.statuts)) {
    for (const [service, valeur] of Object.entries(objet.statuts as Record<string, unknown>)) {
      if (!/^[a-z_]{2,40}$/.test(service) || !valeur || typeof valeur !== "object") continue;
      const { statut, message } = valeur as Record<string, unknown>;
      if (!estStatut(statut)) continue;
      statuts[service] = { statut, message: typeof message === "string" ? message.slice(0, 280) : null };
    }
  }
  const generation = typeof objet.generation === "number" && Number.isFinite(objet.generation) ? objet.generation : 0;
  return { generation, controles, statuts };
}

/** Vrai si le contrôle est actif pour l'application OU en portée globale. */
export function controleActif(etat: EtatIncident, app: ApplicationIncident, controle: ControleIncident): boolean {
  return etat.controles.some((c) => c.controle === controle && (c.portee === "global" || c.portee === app));
}

// ─────────────────────────────────────────────────────────────────────────────
// Règles de chemins par application
// ─────────────────────────────────────────────────────────────────────────────

/** Motif de chemin : préfixe (se termine par « / » ou segment exact) ou expression régulière. */
export type MotifChemin = string | RegExp;

export type ReglesApplication = {
  /** Toujours servis (santé, statut) : jamais bloqués, même application coupée. */
  toujoursOuverts: MotifChemin[];
  /**
   * Pilotage de crise : plateforme, connexion/MFA, rappel Auth. Restent servis quand l'application
   * est coupée ou en lecture seule — sinon il serait impossible de rouvrir.
   */
  pilotage: MotifChemin[];
  /**
   * Appels serveur-à-serveur (webhooks Stripe/Apple/Google, crons, pont d'identité). Servis quand
   * l'application est COUPÉE (la base autorise les chemins serveur : c'est ce qui permet la
   * réconciliation Stripe avant réouverture) ; refusés en 503 en LECTURE SEULE pour que
   * l'émetteur (Stripe) les REJOUE plus tard au lieu d'échouer à mi-traitement.
   */
  serveurAServeur: MotifChemin[];
  /**
   * Tâches planifiées (crons). Refusées tant que `reconciliation_stripe_requise` est actif : après
   * une restauration, un cron d'abonnements (suspensions, conversions d'essai, purge RGPD) agirait
   * sur un état commercial périmé. Les webhooks, eux, restent reçus (c'est la réconciliation).
   */
  crons: MotifChemin[];
  uploads: MotifChemin[];
  exports: MotifChemin[];
  paiements: MotifChemin[];
  /** Envoi/gestion d'invitations : bloqués pour les mutations seulement. */
  invitations: MotifChemin[];
  /** Pages d'ACCEPTATION d'invitation : bloquées pour toutes les méthodes. */
  invitationsAcceptation: MotifChemin[];
  liensPublics: MotifChemin[];
};

const exact = (chemin: string) => new RegExp(`^${chemin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`);

export const REGLES_PAR_APPLICATION: Readonly<Record<ApplicationIncident, ReglesApplication>> = {
  gestion_pro: {
    toujoursOuverts: [exact("/api/health"), exact("/api/status"), exact("/_next")],
    pilotage: [
      exact("/plateforme"),
      exact("/login"),
      exact("/mfa"),
      exact("/auth"),
      exact("/api/auth"),
      exact("/offline"),
      exact("/abonnement-suspendu"),
    ],
    serveurAServeur: [
      exact("/api/stripe/webhook"),
      exact("/api/stripe/abonnement/webhook"),
      exact("/api/stripe/boutique/webhook"),
      exact("/api/tools/monetization/stripe/webhook"),
      exact("/api/tools/monetization/apple/notifications"),
      exact("/api/tools/monetization/google/notifications"),
      exact("/api/webhooks"),
      exact("/api/cron"),
      exact("/api/paiements-bancaires/powens"),
      exact("/api/elsatia-identity"),
    ],
    crons: [exact("/api/cron")],
    uploads: [
      /^\/api\/devis\/[^/]+\/pieces-jointes\/(?:preparer|finaliser)$/,
      exact("/api/messagerie/pieces-jointes/preparer"),
      exact("/api/messagerie/pieces-jointes/finaliser"),
      exact("/api/notes-frais/upload"),
      exact("/api/paie/documents/upload"),
      exact("/api/paie/import"),
    ],
    exports: [
      exact("/api/exports"),
      exact("/api/notes-frais/exports"),
      /^\/api\/paie\/periodes\/[^/]+\/export$/,
      exact("/api/rgpd/export"),
      /^\/api\/documents\/(?:devis|factures)\/[^/]+\/pdf$/,
      exact("/plateforme/entreprises/export"),
      /^\/imprimer\/(?!partage(?:\/|$))/,
    ],
    paiements: [
      exact("/paiement"),
      exact("/api/tools/monetization/checkout"),
      exact("/api/tools/monetization/portal"),
      exact("/api/stripe/oauth"),
    ],
    invitations: [exact("/parametres/acces")],
    invitationsAcceptation: [],
    liensPublics: [exact("/document"), exact("/imprimer/partage"), exact("/api/documents/partage")],
  },
  reserves: {
    toujoursOuverts: [exact("/api/health"), exact("/api/status"), exact("/_next")],
    pilotage: [exact("/login"), exact("/auth"), exact("/hors-ligne"), exact("/acces-refuse"), exact("/abonnement-requis")],
    serveurAServeur: [exact("/api/cron")],
    crons: [exact("/api/cron")],
    uploads: [exact("/api/offline/photo")],
    exports: [/^\/api\/documents\/chantier\/[^/]+\/pdf$/, exact("/imprimer"), /^\/chantiers\/[^/]+\/export$/],
    paiements: [],
    invitations: [exact("/intervenants"), exact("/parametres/membres")],
    invitationsAcceptation: [exact("/invitation"), exact("/rejoindre")],
    liensPublics: [],
  },
  colors: {
    toujoursOuverts: [exact("/api/health"), exact("/api/status"), exact("/_next")],
    pilotage: [exact("/login"), exact("/auth"), exact("/acces-refuse"), exact("/abonnement-requis")],
    serveurAServeur: [],
    crons: [],
    uploads: [exact("/api/photos"), exact("/api/ocr")],
    exports: [exact("/api/export")],
    paiements: [],
    invitations: [exact("/utilisateurs")],
    invitationsAcceptation: [],
    liensPublics: [],
  },
  studio: {
    toujoursOuverts: [exact("/api/health"), exact("/api/status"), exact("/_next")],
    pilotage: [exact("/login"), exact("/auth")],
    serveurAServeur: [exact("/api/elsatia")],
    crons: [exact("/api/elsatia/erasure"), exact("/api/elsatia/reconcile")],
    uploads: [exact("/api/media")],
    exports: [exact("/api/renders")],
    paiements: [],
    invitations: [exact("/settings/members")],
    invitationsAcceptation: [],
    liensPublics: [],
  },
  // Tools n'a pas de proxy serveur (application cliente/native) : l'application est gardée par la
  // base (tables tools_*, bucket tools-releves). Ses routes de facturation vivent dans Gestion Pro.
  tools: {
    toujoursOuverts: [],
    pilotage: [],
    serveurAServeur: [],
    crons: [],
    uploads: [],
    exports: [],
    paiements: [],
    invitations: [],
    invitationsAcceptation: [],
    liensPublics: [],
  },
};

const correspond = (chemin: string, motifs: readonly MotifChemin[]) =>
  motifs.some((m) => (typeof m === "string" ? chemin === m || chemin.startsWith(m.endsWith("/") ? m : `${m}/`) : m.test(chemin)));

const estMutation = (methode: string) => !["GET", "HEAD", "OPTIONS"].includes(methode.toUpperCase());

export type CodeIncident =
  | "SAFE_MODE_APP_OFF"
  | "SAFE_MODE_READ_ONLY"
  | "SAFE_MODE_UPLOADS_OFF"
  | "SAFE_MODE_EXPORTS_OFF"
  | "SAFE_MODE_PAYMENTS_OFF"
  | "SAFE_MODE_INVITATIONS_OFF"
  | "SAFE_MODE_PUBLIC_LINKS_OFF"
  | "SAFE_MODE_STRIPE_RECONCILIATION";

export type DecisionIncident =
  | { action: "continuer" }
  | { action: "bloquer"; statut: 503; code: CodeIncident; message: string; reessayerApres: number };

export const MESSAGES_INCIDENT: Readonly<Record<CodeIncident, string>> = {
  SAFE_MODE_APP_OFF:
    "Cette application ELSATIA est momentanément indisponible pour maintenance. Vos données sont conservées ; réessayez dans quelques minutes.",
  SAFE_MODE_READ_ONLY:
    "ELSATIA est momentanément en lecture seule. Vous pouvez consulter vos données ; les modifications seront possibles dès la fin de la maintenance. Aucune donnée n'est perdue.",
  SAFE_MODE_UPLOADS_OFF: "L'envoi de fichiers est momentanément suspendu. Réessayez plus tard.",
  SAFE_MODE_EXPORTS_OFF: "Les exports et documents PDF sont momentanément suspendus. Réessayez plus tard.",
  SAFE_MODE_PAYMENTS_OFF: "Les paiements en ligne sont momentanément suspendus. Aucun montant n'a été prélevé.",
  SAFE_MODE_INVITATIONS_OFF: "Les invitations sont momentanément suspendues. Votre lien reste valable.",
  SAFE_MODE_PUBLIC_LINKS_OFF: "Ce lien de partage est momentanément indisponible.",
  SAFE_MODE_STRIPE_RECONCILIATION:
    "Tâches planifiées suspendues jusqu'à la réconciliation Stripe post-restauration.",
};

const bloquer = (code: CodeIncident, reessayerApres = 120): DecisionIncident => ({
  action: "bloquer",
  statut: 503,
  code,
  message: MESSAGES_INCIDENT[code],
  reessayerApres,
});

/**
 * Décision HTTP du mode sûr. `etat === null` (état inconnu : base injoignable, jamais lu) →
 * « continuer » : le proxy ne crée pas de panne supplémentaire, et la base reste l'autorité pour
 * toute écriture. Ordre : toujours ouverts > coupure > lecture seule > fonctions ciblées.
 *
 * Les Server Actions (POST sur un chemin de page) ne sont pas filtrées en lecture seule : on ne
 * peut pas les distinguer (la déconnexion en est une) et la base refuse leurs écritures.
 */
export function decisionIncident(entree: {
  app: ApplicationIncident;
  chemin: string;
  methode: string;
  estServerAction?: boolean;
  etat: EtatIncident | null;
  regles?: ReglesApplication;
}): DecisionIncident {
  const { app, chemin, methode, etat } = entree;
  if (!etat || etat.controles.length === 0) return { action: "continuer" };
  const regles = entree.regles ?? REGLES_PAR_APPLICATION[app];
  if (correspond(chemin, regles.toujoursOuverts)) return { action: "continuer" };

  const pilotage = correspond(chemin, regles.pilotage);
  const serveur = correspond(chemin, regles.serveurAServeur);
  const lectureSeule = controleActif(etat, app, "lecture_seule");

  if (controleActif(etat, app, "app_coupee") && !pilotage && !serveur) return bloquer("SAFE_MODE_APP_OFF", 300);

  if (correspond(chemin, regles.crons) && controleActif(etat, app, "reconciliation_stripe_requise")) {
    return bloquer("SAFE_MODE_STRIPE_RECONCILIATION", 900);
  }

  if (lectureSeule) {
    if (serveur) return bloquer("SAFE_MODE_READ_ONLY", 600);
    if (estMutation(methode) && !pilotage && !entree.estServerAction && chemin.startsWith("/api/")) {
      return bloquer("SAFE_MODE_READ_ONLY");
    }
  }

  if (correspond(chemin, regles.liensPublics) && controleActif(etat, app, "liens_publics")) {
    return bloquer("SAFE_MODE_PUBLIC_LINKS_OFF");
  }
  if (correspond(chemin, regles.exports) && controleActif(etat, app, "exports")) return bloquer("SAFE_MODE_EXPORTS_OFF");
  if (correspond(chemin, regles.paiements) && (controleActif(etat, app, "paiements") || lectureSeule)) {
    return bloquer("SAFE_MODE_PAYMENTS_OFF");
  }
  if (controleActif(etat, app, "invitations")
      && (correspond(chemin, regles.invitationsAcceptation)
          || (estMutation(methode) && correspond(chemin, regles.invitations)))) {
    return bloquer("SAFE_MODE_INVITATIONS_OFF");
  }
  if (estMutation(methode) && correspond(chemin, regles.uploads)
      && (controleActif(etat, app, "uploads") || lectureSeule)) {
    return bloquer(lectureSeule ? "SAFE_MODE_READ_ONLY" : "SAFE_MODE_UPLOADS_OFF");
  }
  return { action: "continuer" };
}

/** Corps et en-têtes d'une réponse 503 de mode sûr (JSON pour l'API, HTML minimal sinon). */
export function reponseIncident(
  decision: Extract<DecisionIncident, { action: "bloquer" }>,
  accepteHtml: boolean,
): { statut: 503; corps: string; entetes: Record<string, string> } {
  const entetes: Record<string, string> = {
    "Cache-Control": "no-store",
    "Retry-After": String(decision.reessayerApres),
    "X-Elsatia-Safe-Mode": decision.code,
  };
  if (!accepteHtml) {
    return {
      statut: 503,
      corps: JSON.stringify({ error: decision.message, code: decision.code }),
      entetes: { ...entetes, "Content-Type": "application/json; charset=utf-8" },
    };
  }
  const echappe = decision.message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return {
    statut: 503,
    corps: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ELSATIA — maintenance</title></head><body style="font-family:system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.25rem">Maintenance en cours</h1><p>${echappe}</p></body></html>`,
    entetes: { ...entetes, "Content-Type": "text/html; charset=utf-8" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture de l'état (cache court, repli sur la dernière valeur connue)
// ─────────────────────────────────────────────────────────────────────────────

export type LecteurEtatIncident = {
  lire(): Promise<EtatIncident | null>;
  /** Pour les tests et le drill : oublie le cache. */
  invalider(): void;
};

/**
 * Lecteur mis en cache. `ttlMs` borne le délai de propagation d'une bascule (10 s par défaut) ;
 * en cas d'échec de lecture, la dernière valeur connue reste utilisée jusqu'à `perimeMs`
 * (5 min) — une coupure décidée ne se lève pas parce que la base hoquette. Au-delà : `null`.
 */
export function creerLecteurEtatIncident(options: {
  charger: () => Promise<unknown>;
  ttlMs?: number;
  perimeMs?: number;
  maintenant?: () => number;
}): LecteurEtatIncident {
  const ttl = options.ttlMs ?? 10_000;
  const perime = options.perimeMs ?? 300_000;
  const maintenant = options.maintenant ?? (() => Date.now());
  let dernier: { etat: EtatIncident; lu: number } | null = null;
  let tentative = Number.NEGATIVE_INFINITY;
  let enCours: Promise<EtatIncident | null> | null = null;

  const charger = async (): Promise<EtatIncident | null> => {
    try {
      const etat = analyserEtatIncident(await options.charger());
      if (etat) {
        dernier = { etat, lu: maintenant() };
        return etat;
      }
    } catch {
      // Base injoignable : repli ci-dessous.
    }
    return dernier && maintenant() - dernier.lu <= perime ? dernier.etat : null;
  };

  return {
    async lire() {
      const t = maintenant();
      if (dernier && t - dernier.lu < ttl) return dernier.etat;
      // Pas plus d'une tentative par seconde quand la base est en panne.
      if (!enCours && t - tentative < 1_000) return dernier && t - dernier.lu <= perime ? dernier.etat : null;
      if (!enCours) {
        tentative = t;
        enCours = charger().finally(() => {
          enCours = null;
        });
      }
      return enCours;
    },
    invalider() {
      dernier = null;
      tentative = Number.NEGATIVE_INFINITY;
    },
  };
}

/**
 * Chargeur par défaut : appel PostgREST de l'RPC publique avec la clé PUBLIQUE uniquement.
 * Délai court (1,5 s) : le proxy ne doit jamais attendre une base en panne.
 */
export function chargeurPostgrest(options: {
  urlSupabase: string;
  clePublique: string;
  rpc?: string;
  delaiMs?: number;
  fetchImpl?: typeof fetch;
}): () => Promise<unknown> {
  const rpc = options.rpc ?? "incident_etat_public";
  const url = `${options.urlSupabase.replace(/\/+$/, "")}/rest/v1/rpc/${rpc}`;
  return async () => {
    const reponse = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        apikey: options.clePublique,
        Authorization: `Bearer ${options.clePublique}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(options.delaiMs ?? 1_500),
    });
    if (!reponse.ok) throw new Error(`incident_etat_public: HTTP ${reponse.status}`);
    return reponse.json();
  };
}

/**
 * Garde prête à l'emploi pour le proxy d'une application : rend la réponse 503 à servir (corps,
 * en-têtes) ou `null`. Sans dépendance à Next : chaque proxy l'enveloppe dans sa NextResponse.
 * Sans configuration Supabase (build, tests), l'état est inconnu et rien n'est bloqué.
 */
export function creerGardeProxy(options: {
  app: ApplicationIncident;
  urlSupabase: string | undefined;
  clePublique: string | undefined;
  lecteur?: LecteurEtatIncident;
}) {
  const lecteur = options.lecteur ?? creerLecteurEtatIncident({
    charger: options.urlSupabase && options.clePublique
      ? chargeurPostgrest({ urlSupabase: options.urlSupabase, clePublique: options.clePublique })
      : async () => null,
  });
  return async (requete: { chemin: string; methode: string; entetes: Headers }) => {
    const decision = decisionIncident({
      app: options.app,
      chemin: requete.chemin,
      methode: requete.methode,
      estServerAction: requete.entetes.has("next-action"),
      etat: await lecteur.lire(),
    });
    if (decision.action === "continuer") return null;
    const accepteHtml = !requete.chemin.startsWith("/api/") && (requete.entetes.get("accept") ?? "").includes("text/html");
    return reponseIncident(decision, accepteHtml);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Erreurs renvoyées par la base
// ─────────────────────────────────────────────────────────────────────────────

const INDICES_BASE: Readonly<Record<string, CodeIncident>> = {
  SAFE_MODE_READ_ONLY: "SAFE_MODE_READ_ONLY",
  SAFE_MODE_APP_OFF: "SAFE_MODE_APP_OFF",
  SAFE_MODE_UPLOADS_OFF: "SAFE_MODE_UPLOADS_OFF",
  SAFE_MODE_PUBLIC_LINKS_OFF: "SAFE_MODE_PUBLIC_LINKS_OFF",
  SAFE_MODE_INVITATIONS_OFF: "SAFE_MODE_INVITATIONS_OFF",
};

/** Reconnaît un refus du mode sûr renvoyé par la base (indice PostgREST stable ou SQLSTATE PT503). */
export function codeIncidentDepuisErreur(
  erreur: { hint?: string | null; code?: string | null; message?: string | null } | null | undefined,
): CodeIncident | null {
  if (!erreur) return null;
  if (erreur.hint && INDICES_BASE[erreur.hint]) return INDICES_BASE[erreur.hint];
  if (erreur.hint === "SAFE_MODE" || erreur.code === "PT503") return "SAFE_MODE_READ_ONLY";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Santé
// ─────────────────────────────────────────────────────────────────────────────

export type ResultatControle = "ok" | "ko" | "non_configure";
export type ControleSante = {
  nom: string;
  /** Critique : son échec rend l'application OUTAGE ; sinon DEGRADED. */
  critique: boolean;
  executer: (signal: AbortSignal) => Promise<ResultatControle>;
};

export type RapportSantePublic = {
  statut: StatutService;
  controles: Record<string, ResultatControle>;
  mode_sur: { lecture_seule: boolean; application_coupee: boolean };
  horodatage: string;
};

/**
 * Exécute les contrôles en parallèle, chacun borné par `delaiMs`. La réponse publique ne contient
 * QUE des noms de contrôles et ok/ko/non_configure : jamais de message d'erreur, d'URL, de clé ni
 * de valeur de configuration. Les détails restent dans les journaux serveur (`journaliser`).
 */
export async function evaluerSante(options: {
  app: ApplicationIncident;
  controles: ControleSante[];
  etat: EtatIncident | null;
  delaiMs?: number;
  journaliser?: (nom: string, erreur: unknown) => void;
  maintenant?: () => Date;
}): Promise<RapportSantePublic> {
  const delai = options.delaiMs ?? 2_500;
  const resultats = await Promise.all(
    options.controles.map(async (c) => {
      const controleur = new AbortController();
      const minuterie = setTimeout(() => controleur.abort(), delai);
      try {
        const r = await Promise.race([
          c.executer(controleur.signal),
          new Promise<ResultatControle>((resoudre) =>
            controleur.signal.addEventListener("abort", () => resoudre("ko"), { once: true }),
          ),
        ]);
        return [c, r] as const;
      } catch (erreur) {
        options.journaliser?.(c.nom, erreur);
        return [c, "ko" as ResultatControle] as const;
      } finally {
        clearTimeout(minuterie);
      }
    }),
  );
  const controles: Record<string, ResultatControle> = {};
  let statut: StatutService = "OPERATIONAL";
  for (const [c, r] of resultats) {
    controles[c.nom] = r;
    if (r === "ko") statut = c.critique ? "OUTAGE" : statut === "OUTAGE" ? "OUTAGE" : "DEGRADED";
  }
  const etat = options.etat;
  const lectureSeule = etat ? controleActif(etat, options.app, "lecture_seule") : false;
  const coupee = etat ? controleActif(etat, options.app, "app_coupee") : false;
  if (statut === "OPERATIONAL" && coupee) statut = "OUTAGE";
  else if (statut === "OPERATIONAL" && lectureSeule) statut = "READ_ONLY";
  return {
    statut,
    controles,
    mode_sur: { lecture_seule: lectureSeule, application_coupee: coupee },
    horodatage: (options.maintenant?.() ?? new Date()).toISOString(),
  };
}

/**
 * Sondes Supabase sans effet de bord, avec la clé PUBLIQUE : base (RPC publique de l'état
 * d'incident, qui traverse PostgREST et Postgres), Auth (`/auth/v1/health`), Storage
 * (`/storage/v1/status`). Base et Auth sont critiques ; Storage dégrade seulement.
 */
export function controlesSupabase(options: {
  urlSupabase: string | undefined;
  clePublique: string | undefined;
  rpcEtat?: string;
  fetchImpl?: typeof fetch;
}): ControleSante[] {
  const url = options.urlSupabase?.replace(/\/+$/, "");
  const cle = options.clePublique;
  const f = options.fetchImpl ?? fetch;
  const nonConfigure = async (): Promise<ResultatControle> => "non_configure";
  if (!url || !cle) {
    return [
      { nom: "db", critique: true, executer: nonConfigure },
      { nom: "auth", critique: true, executer: nonConfigure },
      { nom: "storage", critique: false, executer: nonConfigure },
    ];
  }
  const entetes = { apikey: cle, Authorization: `Bearer ${cle}` };
  const sonde = async (p: Promise<Response>): Promise<ResultatControle> => ((await p).ok ? "ok" : "ko");
  return [
    {
      nom: "db",
      critique: true,
      executer: (signal) => sonde(f(`${url}/rest/v1/rpc/${options.rpcEtat ?? "incident_etat_public"}`, {
        method: "POST", headers: { ...entetes, "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal,
      })),
    },
    { nom: "auth", critique: true, executer: (signal) => sonde(f(`${url}/auth/v1/health`, { headers: entetes, cache: "no-store", signal })) },
    { nom: "storage", critique: false, executer: (signal) => sonde(f(`${url}/storage/v1/status`, { headers: entetes, cache: "no-store", signal })) },
  ];
}

/** Code HTTP du rapport : 503 seulement en OUTAGE (les sondes externes déclenchent l'alerte). */
export const codeHttpSante = (rapport: RapportSantePublic) => (rapport.statut === "OUTAGE" ? 503 : 200);
