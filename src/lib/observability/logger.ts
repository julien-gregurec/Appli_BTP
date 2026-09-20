import * as Sentry from "@sentry/nextjs";

// Journalisation structurée minimale pour l'exploitation (incident readiness).
// Objectif : pouvoir corréler request/entreprise/route/opération/statut/durée
// sans jamais faire fuiter de secrets. Ne remplace pas Sentry : les niveaux
// error/critical y sont systématiquement relayés (captureException/captureMessage).

export type NiveauLog = "info" | "warn" | "error" | "critical";

// Taxonomie applicative — cf. docs/qualification/ELSATIA_OBSERVABILITY_INCIDENT_READINESS_V1.md
export type CategorieLog =
  | "security"
  | "billing"
  | "document"
  | "data"
  | "auth"
  | "storage"
  | "email"
  | "worker"
  | "platform";

export type ContexteLog = {
  requestId?: string;
  userId?: string;
  entrepriseId?: string;
  route?: string;
  operation?: string;
  statusCode?: number;
  durationMs?: number;
  [cle: string]: unknown;
};

const CLES_SENSIBLES = /^(password|mot_de_passe|token|access_token|refresh_token|secret|authorization|cookie|iban|api_key|apikey|client_secret|stripe_secret|dsn)$/i;
const MOTIF_JWT = /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const MOTIF_IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const MOTIF_CLE_STRIPE = /\b(?:sk|rk|whsec)_(?:live_|test_)?[A-Za-z0-9]{10,}\b/g;

function redigerValeur(valeur: unknown, profondeur = 0): unknown {
  if (profondeur > 4) return "[tronqué]";
  if (typeof valeur === "string") {
    return valeur
      .replace(MOTIF_JWT, "[jwt-redacted]")
      .replace(MOTIF_IBAN, "[iban-redacted]")
      .replace(MOTIF_CLE_STRIPE, "[clé-redacted]");
  }
  if (Array.isArray(valeur)) return valeur.map((v) => redigerValeur(v, profondeur + 1));
  if (valeur && typeof valeur === "object") {
    const source = valeur as Record<string, unknown>;
    const resultat: Record<string, unknown> = {};
    for (const cle of Object.keys(source)) {
      resultat[cle] = CLES_SENSIBLES.test(cle) ? "[redacted]" : redigerValeur(source[cle], profondeur + 1);
    }
    return resultat;
  }
  return valeur;
}

function pseudonymiser(identifiant: string) {
  // Pas de dépendance crypto ici : simple obfuscation stable, suffisante pour
  // corréler les logs entre eux sans exposer l'identifiant brut en clair.
  let h = 0;
  for (let i = 0; i < identifiant.length; i++) {
    h = (h * 31 + identifiant.charCodeAt(i)) | 0;
  }
  return `u_${(h >>> 0).toString(36)}`;
}

export function logEvenement(niveau: NiveauLog, categorie: CategorieLog, message: string, contexte: ContexteLog = {}, erreur?: unknown) {
  const { userId, ...reste } = contexte;
  const contexteRedige = redigerValeur({
    ...reste,
    userId: userId ? pseudonymiser(userId) : undefined,
  }) as Record<string, unknown>;

  const ligne = {
    timestamp: new Date().toISOString(),
    niveau,
    categorie,
    message: redigerValeur(message) as string,
    ...contexteRedige,
    ...(erreur instanceof Error ? { erreur: redigerValeur(erreur.message) } : erreur ? { erreur: redigerValeur(String(erreur)) } : {}),
  };

  const sortie = JSON.stringify(ligne);
  if (niveau === "critical" || niveau === "error") console.error(sortie);
  else if (niveau === "warn") console.warn(sortie);
  else console.info(sortie);

  if (niveau === "error" || niveau === "critical") {
    Sentry.withScope((scope) => {
      scope.setTag("categorie", categorie);
      scope.setTag("niveau", niveau);
      if (contexteRedige.requestId) scope.setTag("requestId", String(contexteRedige.requestId));
      if (contexteRedige.entrepriseId) scope.setTag("entrepriseId", String(contexteRedige.entrepriseId));
      if (contexteRedige.route) scope.setTag("route", String(contexteRedige.route));
      scope.setContext("observabilite", contexteRedige);
      scope.setLevel(niveau === "critical" ? "fatal" : "error");
      if (erreur instanceof Error) Sentry.captureException(erreur);
      else Sentry.captureMessage(message);
    });
  }
}

export const logInfo = (categorie: CategorieLog, message: string, contexte?: ContexteLog) => logEvenement("info", categorie, message, contexte);
export const logWarn = (categorie: CategorieLog, message: string, contexte?: ContexteLog) => logEvenement("warn", categorie, message, contexte);
export const logErreur = (categorie: CategorieLog, message: string, contexte?: ContexteLog, erreur?: unknown) => logEvenement("error", categorie, message, contexte, erreur);
export const logCritique = (categorie: CategorieLog, message: string, contexte?: ContexteLog, erreur?: unknown) => logEvenement("critical", categorie, message, contexte, erreur);
