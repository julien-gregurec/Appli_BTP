import { LINKEDIN_VERSION_DEFAUT, META_GRAPH_VERSION_DEFAUT, raisonSimulation } from "@/lib/social/config";

// Contrôle de configuration ELSATIA Social. Ne renvoie JAMAIS une valeur de
// secret : seulement présence, format et conséquence.

export type EtatControle = "ok" | "manquant" | "invalide" | "attention" | "info";
export type Controle = { cle: string; groupe: "ELSATIA" | "Meta" | "LinkedIn"; etat: EtatControle; detail: string; secret: boolean };

const valeur = (cle: string) => process.env[cle]?.trim() ?? "";

function octetsCle(v: string): number {
  if (/^[0-9a-f]{64}$/i.test(v)) return 32;
  try {
    return Buffer.from(v, "base64").length;
  } catch {
    return 0;
  }
}

export function versionLinkedInAgeMois(version: string, maintenant = new Date()): number | null {
  const m = /^(\d{4})(\d{2})$/.exec(version);
  if (!m) return null;
  return (maintenant.getFullYear() - Number(m[1])) * 12 + (maintenant.getMonth() + 1 - Number(m[2]));
}

export function controlerConfiguration(maintenant = new Date()): Controle[] {
  const c: Controle[] = [];
  const ajouter = (cle: string, groupe: Controle["groupe"], etat: EtatControle, detail: string, secret = true) => c.push({ cle, groupe, etat, detail, secret });

  // ELSATIA
  const cle = valeur("SOCIAL_TOKEN_ENCRYPTION_KEY");
  if (!cle) ajouter("SOCIAL_TOKEN_ENCRYPTION_KEY", "ELSATIA", "manquant", "Obligatoire avant toute connexion OAuth. Générer avec : openssl rand -hex 32");
  else if (octetsCle(cle) !== 32) ajouter("SOCIAL_TOKEN_ENCRYPTION_KEY", "ELSATIA", "invalide", "Doit faire exactement 32 octets (64 caractères hexadécimaux).");
  else ajouter("SOCIAL_TOKEN_ENCRYPTION_KEY", "ELSATIA", "ok", "Présente, 32 octets.");
  const ancienne = valeur("SOCIAL_TOKEN_ENCRYPTION_KEY_PREVIOUS");
  if (ancienne) ajouter("SOCIAL_TOKEN_ENCRYPTION_KEY_PREVIOUS", "ELSATIA", ancienne === cle ? "invalide" : "attention", ancienne === cle ? "Identique à la clé courante." : "Rotation en cours : cliquer « Rechiffrer les jetons », puis retirer cette variable.");
  const cron = valeur("CRON_SECRET");
  ajouter("CRON_SECRET", "ELSATIA", !cron ? "manquant" : cron.length < 32 ? "invalide" : "ok", !cron ? "Obligatoire pour le planificateur (/api/social/cron). Générer avec : openssl rand -hex 32" : cron.length < 32 ? "Trop court : 32 caractères minimum." : "Présent.");
  const simulation = raisonSimulation();
  ajouter("SOCIAL_DRY_RUN", "ELSATIA", simulation ? "ok" : "attention", simulation ? `MODE SIMULATION actif : ${simulation}.` : "PUBLICATION RÉELLE ACTIVE en production.", false);
  const url = valeur("NEXT_PUBLIC_APP_URL");
  ajouter("NEXT_PUBLIC_APP_URL", "ELSATIA", !url ? "manquant" : /^https:\/\//.test(url) || /^http:\/\/localhost(:\d+)?$/.test(url.replace(/\/$/, "")) ? "ok" : "invalide", !url ? "Nécessaire aux URL de retour OAuth." : `URL de base : ${url.replace(/\/$/, "")}`, false);
  ajouter("SUPABASE_SERVICE_ROLE_KEY", "ELSATIA", valeur("SUPABASE_SERVICE_ROLE_KEY") ? "ok" : "manquant", valeur("SUPABASE_SERVICE_ROLE_KEY") ? "Présente." : "Obligatoire (accès serveur).");
  ajouter("OPENAI_API_KEY", "ELSATIA", valeur("OPENAI_API_KEY") ? "ok" : "attention", valeur("OPENAI_API_KEY") ? "Présente (Assistant Social)." : "Absente : l’Assistant Social ne pourra pas générer de variantes.");

  // Meta
  const appId = valeur("META_APP_ID");
  ajouter("META_APP_ID", "Meta", !appId ? "manquant" : /^\d{6,20}$/.test(appId) ? "ok" : "invalide", !appId ? "Identifiant de l’application Meta (Paramètres › Général)." : /^\d+$/.test(appId) ? "Présent (numérique)." : "Doit être numérique.", false);
  const secret = valeur("META_APP_SECRET");
  ajouter("META_APP_SECRET", "Meta", !secret ? "manquant" : /^[0-9a-f]{32}$/i.test(secret) ? "ok" : "attention", !secret ? "Clé secrète de l’application (Paramètres › Général)." : /^[0-9a-f]{32}$/i.test(secret) ? "Présente (format attendu)." : "Présente, format inhabituel : vérifier avec « Tester l’application Meta ».");
  const verify = valeur("META_WEBHOOK_VERIFY_TOKEN");
  ajouter("META_WEBHOOK_VERIFY_TOKEN", "Meta", !verify ? "manquant" : verify.length < 16 ? "invalide" : "ok", !verify ? "Chaîne aléatoire à saisir aussi dans Webhooks chez Meta. Générer avec : openssl rand -hex 24" : verify.length < 16 ? "Trop court : 16 caractères minimum." : "Présent.");
  const versionMeta = valeur("META_GRAPH_API_VERSION") || META_GRAPH_VERSION_DEFAUT;
  ajouter("META_GRAPH_API_VERSION", "Meta", /^v\d{2,3}\.0$/.test(versionMeta) ? "ok" : "invalide", `Version utilisée : ${versionMeta}${valeur("META_GRAPH_API_VERSION") ? "" : " (par défaut)"}.`, false);
  if (valeur("META_LOGIN_CONFIG_ID")) ajouter("META_LOGIN_CONFIG_ID", "Meta", /^\d+$/.test(valeur("META_LOGIN_CONFIG_ID")) ? "ok" : "invalide", "Facebook Login for Business : la configuration remplace la liste de permissions.", false);

  // LinkedIn
  ajouter("LINKEDIN_CLIENT_ID", "LinkedIn", valeur("LINKEDIN_CLIENT_ID") ? "ok" : "manquant", valeur("LINKEDIN_CLIENT_ID") ? "Présent." : "Onglet Auth de l’application LinkedIn.", false);
  ajouter("LINKEDIN_CLIENT_SECRET", "LinkedIn", valeur("LINKEDIN_CLIENT_SECRET") ? "ok" : "manquant", valeur("LINKEDIN_CLIENT_SECRET") ? "Présent." : "Onglet Auth de l’application LinkedIn (Primary Client Secret).");
  const versionLi = valeur("LINKEDIN_API_VERSION") || LINKEDIN_VERSION_DEFAUT;
  const age = versionLinkedInAgeMois(versionLi, maintenant);
  ajouter("LINKEDIN_API_VERSION", "LinkedIn", age === null ? "invalide" : age >= 12 ? "invalide" : age >= 10 ? "attention" : "ok", age === null ? "Format attendu : AAAAMM." : age >= 12 ? `Version ${versionLi} retirée par LinkedIn (plus d’un an) : mettre à jour.` : age >= 10 ? `Version ${versionLi} bientôt retirée (${age} mois) : mettre à jour.` : `Version ${versionLi} (${age} mois).`, false);
  return c;
}
