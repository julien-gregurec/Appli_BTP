#!/usr/bin/env node
/**
 * ELSATIA Studio — garde de cible de la Preview Studio DÉDIÉE (B + I1).
 *
 * But : avant TOUTE écriture distante (db push, variables Vercel, déploiement, alias de domaine),
 * prouver que l'environnement fourni vise exclusivement :
 *   - SUPABASE STUDIO PREVIEW  : projet Supabase dédié à Studio, jamais le projet partagé GP
 *                                (Preview `pgvvpqyjziyapbbkydmc`) ni la Production connue ;
 *   - VERCEL STUDIO PREVIEW    : projet Vercel « elsatia-studio-preview », jamais `--prod`,
 *                                jamais le domaine de Production `studio.elsatia.fr`.
 * Toute ambiguïté est un refus (STOP WRITES) : le diagnostic continue, l'écriture non.
 *
 * Tout est pur (aucun réseau, aucune écriture), testé par scripts/preview/studio-preview-guard.test.mjs.
 * GARANTIE : aucune valeur d'environnement n'est affichée ; seuls noms, états et codes sortent.
 *
 * Usage :
 *   node scripts/preview/studio-preview-guard.mjs --env-file <studio.env> --studio-ref <ref> \
 *        [--worker-env-file <worker.env>] [--check-links] [--strict]
 *   --studio-ref       : référence du projet Supabase Studio Preview, déclarée par l'opérateur
 *                        (aucune référence n'est codée en dur : le projet n'existe pas encore).
 *   --check-links      : vérifie aussi apps/studio/.vercel/project.json et les liens CLI Supabase.
 * Sortie : 0 GO (écritures autorisées) · 1 NO-GO · 2 refus d'usage.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  REF_PREVIEW_AUTORISEE,
  REF_PRODUCTION_CONNUE,
  Refus,
  SORTIE,
  chargerFichierEnv,
  estDefinie,
  estPointEntree,
  ligne,
  lireOptions,
  refDepuisUrlApi,
} from "./lib/preview-guard.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

/** Nom du projet Vercel dédié (slug de « ELSATIA Studio Preview »). */
export const PROJET_VERCEL_STUDIO_PREVIEW = "elsatia-studio-preview";
/** Domaine Preview préféré. */
export const DOMAINE_STUDIO_PREVIEW = "studio-preview.elsatia.fr";
/** Hôtes de Production ELSATIA (packages/email/src/applications.ts) : jamais ciblés par la Preview. */
export const HOTES_PRODUCTION = Object.freeze([
  "elsatia.fr", "www.elsatia.fr", "app.elsatia.fr", "tools.elsatia.fr",
  "colors.elsatia.fr", "reserves.elsatia.fr", "studio.elsatia.fr",
]);
/** Projets Supabase qui ne sont PAS le projet Studio dédié : GP partagé (Preview) et Production. */
export const REFS_INTERDITES = Object.freeze({
  [REF_PREVIEW_AUTORISEE]: "projet Supabase PARTAGÉ GP Preview (jamais pour Studio : B + I1)",
  [REF_PRODUCTION_CONNUE]: "projet Supabase PRODUCTION",
});

const hote = (url) => {
  try { return new URL(String(url).trim()).hostname.toLowerCase(); } catch { return null; }
};
const https = (url) => {
  try { return new URL(String(url).trim()).protocol === "https:"; } catch { return false; }
};
const estHoteProduction = (h) => Boolean(h) && HOTES_PRODUCTION.includes(h);

/** Charge utile d'un JWT (sans vérification de signature : on n'en lit que `role` et `ref`). */
export function payloadJwt(valeur) {
  if (typeof valeur !== "string") return null;
  const parties = valeur.trim().split(".");
  if (parties.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parties[1], "base64url").toString("utf8")); } catch { return null; }
}

/** Nature d'une clé Supabase, sans jamais la renvoyer : service | publique | inconnue. */
export function natureCleSupabase(valeur) {
  if (!estDefinie(valeur)) return { nature: null };
  const v = valeur.trim();
  if (v.startsWith("sb_secret_")) return { nature: "service" };
  if (v.startsWith("sb_publishable_")) return { nature: "publique" };
  const p = payloadJwt(v);
  if (p?.role === "service_role") return { nature: "service", ref: p.ref ?? null };
  if (p?.role === "anon") return { nature: "publique", ref: p.ref ?? null };
  return { nature: "inconnue" };
}

/**
 * Pure : constats de ciblage pour l'environnement WEB Studio Preview.
 * Chaque constat : { ok, code, sujet, message }. `ok: false` = STOP WRITES.
 */
export function verifierEnvStudioPreview(env, { refStudio } = {}) {
  const c = [];
  const add = (ok, code, sujet, message = "") => c.push({ ok, code, sujet, message });
  const ref = String(refStudio ?? "").trim().toLowerCase();

  // G1 — référence Studio déclarée, jamais GP partagé ni Production.
  if (!/^[a-z0-9]{20}$/.test(ref)) add(false, "SP-REF-DECLAREE", "--studio-ref", "référence du projet Supabase Studio Preview absente ou de forme inattendue");
  else if (REFS_INTERDITES[ref]) add(false, "SP-REF-INTERDITE", "--studio-ref", REFS_INTERDITES[ref]);
  else add(true, "SP-REF-DECLAREE", "--studio-ref", "référence dédiée déclarée (hors GP, hors Production)");

  // G2 — indicateurs d'environnement.
  const appEnv = env.ELSATIA_APPLICATION_ENV?.trim();
  add(appEnv === "preview", "SP-APP-ENV", "ELSATIA_APPLICATION_ENV", appEnv === "preview" ? "preview" : "« preview » exigé");
  const vercelEnv = env.VERCEL_ENV?.trim();
  add(!vercelEnv || vercelEnv === "preview", "SP-VERCEL-ENV", "VERCEL_ENV", !vercelEnv ? "absente (hors Vercel)" : vercelEnv === "preview" ? "preview" : "cible Vercel non Preview : refus");

  // G3 — projet Supabase réellement visé par l'URL publique.
  const refUrl = refDepuisUrlApi(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!refUrl) add(false, "SP-SUPABASE-URL", "NEXT_PUBLIC_SUPABASE_URL", "absente ou pas de la forme https://<ref>.supabase.co");
  else if (REFS_INTERDITES[refUrl]) add(false, "SP-SUPABASE-URL", "NEXT_PUBLIC_SUPABASE_URL", REFS_INTERDITES[refUrl]);
  else if (refUrl !== ref) add(false, "SP-SUPABASE-URL", "NEXT_PUBLIC_SUPABASE_URL", "ne vise pas la référence Studio déclarée");
  else add(true, "SP-SUPABASE-URL", "NEXT_PUBLIC_SUPABASE_URL", "projet Studio dédié");

  // G4 — origine Studio : Preview uniquement.
  const hs = hote(env.NEXT_PUBLIC_STUDIO_URL);
  if (!hs || !https(env.NEXT_PUBLIC_STUDIO_URL)) add(false, "SP-ORIGINE", "NEXT_PUBLIC_STUDIO_URL", "absente ou non HTTPS");
  else if (estHoteProduction(hs)) add(false, "SP-ORIGINE", "NEXT_PUBLIC_STUDIO_URL", "domaine de PRODUCTION : refus");
  else if (hs === DOMAINE_STUDIO_PREVIEW || hs.endsWith(".vercel.app")) add(true, "SP-ORIGINE", "NEXT_PUBLIC_STUDIO_URL", hs === DOMAINE_STUDIO_PREVIEW ? "domaine Preview dédié" : "URL Vercel Preview");
  else add(false, "SP-ORIGINE", "NEXT_PUBLIC_STUDIO_URL", `seuls ${DOMAINE_STUDIO_PREVIEW} ou *.vercel.app sont admis`);

  // G5 — identité B + I1 : jamais le mode local, jamais l'identité centrale de Production.
  const mode = env.STUDIO_IDENTITY_MODE?.trim();
  add(!mode || mode === "elsatia", "SP-IDENTITY-MODE", "STUDIO_IDENTITY_MODE", !mode || mode === "elsatia" ? "elsatia (aucun mot de passe Studio)" : "« local » ou inconnu refusé en Preview");
  for (const nom of ["ELSATIA_IDENTITY_ISSUER", "ELSATIA_IDENTITY_HANDOFF_URL"]) {
    const h = hote(env[nom]);
    if (!h || !https(env[nom])) add(false, "SP-IDENTITY-URL", nom, "absente ou non HTTPS");
    else if (estHoteProduction(h)) add(false, "SP-IDENTITY-URL", nom, "identité centrale de PRODUCTION : refus (Preview → Production)");
    else add(true, "SP-IDENTITY-URL", nom, "HTTPS, hors Production");
  }
  const handoff = hote(env.ELSATIA_IDENTITY_HANDOFF_URL);
  const issuer = hote(env.ELSATIA_IDENTITY_ISSUER);
  if (handoff && issuer) add(handoff === issuer, "SP-IDENTITY-COHERENCE", "ISSUER / HANDOFF_URL", handoff === issuer ? "même GP Preview" : "hôtes différents : deux identités centrales mêlées");
  if (estDefinie(env.ELSATIA_IDENTITY_JWKS)) {
    let ok = false;
    try {
      const jwks = JSON.parse(env.ELSATIA_IDENTITY_JWKS);
      ok = Array.isArray(jwks.keys) && jwks.keys.length > 0 && jwks.keys.every((k) => k.d === undefined);
    } catch { ok = false; }
    add(ok, "SP-JWKS", "ELSATIA_IDENTITY_JWKS", ok ? "JWKS public épinglé (aucune clé privée)" : "JWKS illisible ou contient une clé PRIVÉE (champ d)");
  } else if (estDefinie(env.ELSATIA_IDENTITY_JWKS_URL)) {
    const h = hote(env.ELSATIA_IDENTITY_JWKS_URL);
    const ok = Boolean(h) && https(env.ELSATIA_IDENTITY_JWKS_URL) && !estHoteProduction(h);
    add(ok, "SP-JWKS", "ELSATIA_IDENTITY_JWKS_URL", ok ? "HTTPS, hors Production" : "non HTTPS ou JWKS de PRODUCTION");
  } else add(false, "SP-JWKS", "ELSATIA_IDENTITY_JWKS(_URL)", "aucune source de clés publiques");

  // G6 — clés : service côté serveur seulement, du projet Studio uniquement.
  const service = natureCleSupabase(env.STUDIO_AUTH_SERVICE_KEY);
  if (service.nature !== "service") add(false, "SP-SERVICE-KEY", "STUDIO_AUTH_SERVICE_KEY", service.nature ? "n'est pas une clé de service" : "absente");
  else if (service.ref && service.ref !== ref) add(false, "SP-SERVICE-KEY", "STUDIO_AUTH_SERVICE_KEY", "clé d'un AUTRE projet Supabase");
  else add(true, "SP-SERVICE-KEY", "STUDIO_AUTH_SERVICE_KEY", "clé de service (serveur)");
  // Forme complète : `supabase projects api-keys` sans --reveal renvoie la clé secrète MASQUÉE
  // (préfixe + « … ») — le préfixe seul ne prouve rien (constaté au premier déploiement V2).
  const formeIncomplete = ["STUDIO_AUTH_SERVICE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter((k) => {
    const v = env[k]?.trim() ?? "";
    return /^sb_(secret|publishable)_/.test(v) && !/^sb_(secret|publishable)_[A-Za-z0-9_-]{20,}$/.test(v);
  });
  add(formeIncomplete.length === 0, "SP-KEY-FORME", "clés sb_*", formeIncomplete.length ? `clé masquée ou tronquée : ${formeIncomplete.join(", ")} (api-keys --reveal)` : "forme complète");
  add(env.STUDIO_STORAGE_SERVICE_KEY === env.STUDIO_AUTH_SERVICE_KEY, "SP-SERVICE-KEY-PAIRE", "STUDIO_STORAGE_SERVICE_KEY", env.STUDIO_STORAGE_SERVICE_KEY === env.STUDIO_AUTH_SERVICE_KEY ? "identique à STUDIO_AUTH_SERVICE_KEY" : "différente : deux projets mêlés");
  const publique = natureCleSupabase(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (publique.nature !== "publique") add(false, "SP-PUBLIC-KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publique.nature === "service" ? "CLÉ DE SERVICE exposée au navigateur" : "absente ou non reconnue");
  else if (publique.ref && publique.ref !== ref) add(false, "SP-PUBLIC-KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "clé d'un AUTRE projet Supabase");
  else add(true, "SP-PUBLIC-KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "clé publique");
  const fuites = Object.entries(env)
    .filter(([k, v]) => k.startsWith("NEXT_PUBLIC_") && (natureCleSupabase(v).nature === "service" || (estDefinie(v) && estDefinie(env.STUDIO_AUTH_SERVICE_KEY) && v.trim() === env.STUDIO_AUTH_SERVICE_KEY.trim())))
    .map(([k]) => k);
  add(fuites.length === 0, "SP-NO-SERVICE-IN-BROWSER", "NEXT_PUBLIC_*", fuites.length ? `clé de service dans ${fuites.join(", ")}` : "aucune clé de service exposée");

  // G7 — secrets de planification.
  const cron = env.STUDIO_CRON_SECRET ?? "";
  const cronOk = cron.trim().length >= 32 && cron !== env.CRON_SECRET;
  add(cronOk, "SP-CRON-SECRET", "STUDIO_CRON_SECRET", cronOk ? "≥ 32 caractères, distinct de CRON_SECRET" : "absent, trop court (< 32) ou égal à CRON_SECRET");

  // G8 — surface Studio : activée pour CETTE Preview seulement, inscription fermée, analyse IA off.
  const enabled = env.STUDIO_ENABLED?.trim().toLowerCase();
  add(enabled === "1" || enabled === "true", "SP-ENABLED", "STUDIO_ENABLED", enabled === "1" || enabled === "true" ? "activé (Preview Studio dédiée)" : "« 1 » attendu sur la Preview Studio dédiée");
  const signup = env.STUDIO_SIGNUP_MODE?.trim();
  add(!signup || signup === "closed", "SP-SIGNUP", "STUDIO_SIGNUP_MODE", !signup || signup === "closed" ? "closed" : "aucune inscription Studio publique : « closed » exigé");
  const ia = env.STUDIO_AI_ANALYSIS?.trim();
  add(!ia || ia === "0", "SP-AI", "STUDIO_AI_ANALYSIS", !ia || ia === "0" ? "désactivée" : "worker d'analyse non déployé : « 0 » exigé");

  // G9 — e-mail : jamais d'envoi réel hors allowlist en Preview.
  // Studio n'envoie que via STUDIO_MAIL_PROVIDER=resend (apps/studio/src/lib/mailer.ts), gardé en
  // code par EMAIL_PREVIEW_ALLOWLIST (mail-recipients.ts) ; mailpit = boucle locale uniquement.
  const provider = env.STUDIO_MAIL_PROVIDER?.trim().toLowerCase();
  if (provider === "mailpit") add(false, "SP-EMAIL", "STUDIO_MAIL_PROVIDER", "mailpit = banc local uniquement");
  if (provider === "resend" || estDefinie(env.STUDIO_RESEND_API_KEY)) {
    const ok = estDefinie(env.EMAIL_PREVIEW_ALLOWLIST);
    add(ok, "SP-EMAIL", "EMAIL_PREVIEW_ALLOWLIST", ok ? "allowlist présente" : "fournisseur e-mail configuré sans allowlist Preview");
  } else add(true, "SP-EMAIL", "e-mail", "aucun fournisseur : invitations par lien affiché (REMOTE_PROOF_REQUIRED pour l'envoi réel)");

  return c;
}

/** Pure : constats pour l'environnement du WORKER Studio Preview (rendu vidéo). */
export function verifierEnvWorkerStudioPreview(envWorker, envWeb, { refStudio } = {}) {
  const c = [];
  const add = (ok, code, sujet, message = "") => c.push({ ok, code, sujet, message });
  const ref = String(refStudio ?? "").trim().toLowerCase();
  const refUrl = refDepuisUrlApi(envWorker.NEXT_PUBLIC_SUPABASE_URL);
  add(Boolean(refUrl) && refUrl === ref && !REFS_INTERDITES[refUrl], "SPW-SUPABASE-URL", "worker NEXT_PUBLIC_SUPABASE_URL", refUrl === ref ? "projet Studio dédié" : "ne vise pas le projet Studio déclaré");
  const cle = natureCleSupabase(envWorker.STUDIO_STORAGE_SERVICE_KEY);
  add(cle.nature === "service" && (!cle.ref || cle.ref === ref), "SPW-SERVICE-KEY", "worker STUDIO_STORAGE_SERVICE_KEY", cle.nature === "service" ? "clé de service Studio" : "absente ou non service");
  if (envWeb) add(envWorker.STUDIO_STORAGE_SERVICE_KEY === envWeb.STUDIO_STORAGE_SERVICE_KEY, "SPW-SERVICE-KEY-PAIRE", "worker ↔ web", envWorker.STUDIO_STORAGE_SERVICE_KEY === envWeb.STUDIO_STORAGE_SERVICE_KEY ? "même projet Studio" : "clés différentes : projets mêlés");
  const redis = envWorker.STUDIO_REDIS_URL?.trim() ?? "";
  let redisOk = false;
  try { const u = new URL(redis); redisOk = u.protocol === "rediss:" && Boolean(u.password); } catch { redisOk = false; }
  add(redisOk, "SPW-REDIS", "STUDIO_REDIS_URL", redisOk ? "TLS + mot de passe" : "rediss:// avec mot de passe exigé (instance Preview dédiée)");
  const gp = Object.keys(envWorker).filter((k) => /^(SUPABASE_SERVICE_ROLE_KEY|STRIPE_|CRON_SECRET$)/.test(k) && estDefinie(envWorker[k]));
  add(gp.length === 0, "SPW-NO-GP", "worker", gp.length ? `variables GP présentes : ${gp.join(", ")}` : "aucune variable GP");
  const env = envWorker.ELSATIA_APPLICATION_ENV?.trim();
  add(env !== "production", "SPW-APP-ENV", "worker ELSATIA_APPLICATION_ENV", env === "production" ? "PRODUCTION : refus" : env ?? "absente");
  return c;
}

/** Pure : liens CLI/Vercel locaux (contenus fournis par l'appelant). */
export function verifierLiens({ vercelProject, refLieeStudio, refLieeRacine }, { refStudio } = {}) {
  const c = [];
  const add = (ok, code, sujet, message = "") => c.push({ ok, code, sujet, message });
  const ref = String(refStudio ?? "").trim().toLowerCase();
  if (!vercelProject) add(false, "SPL-VERCEL", "apps/studio/.vercel/project.json", "absent : `vercel link --cwd apps/studio --project elsatia-studio-preview`");
  else {
    const nom = vercelProject.projectName;
    add(nom === PROJET_VERCEL_STUDIO_PREVIEW, "SPL-VERCEL", "projet Vercel lié", nom === PROJET_VERCEL_STUDIO_PREVIEW ? PROJET_VERCEL_STUDIO_PREVIEW : "autre projet que elsatia-studio-preview : refus");
  }
  const lie = refLieeStudio?.trim().toLowerCase();
  add(lie === ref && !REFS_INTERDITES[lie], "SPL-SUPABASE-STUDIO", "apps/studio/supabase/.temp/project-ref", lie === ref ? "lié au projet Studio déclaré" : "non lié ou lié à un autre projet");
  const racine = refLieeRacine?.trim().toLowerCase();
  add(!racine || racine !== ref, "SPL-SUPABASE-RACINE", "supabase/.temp/project-ref", !racine ? "aucun lien racine" : racine !== ref ? "racine liée à un autre projet (GP) : inchangée" : "la RACINE est liée au projet Studio : un `db push` racine y enverrait le train GP");
  return c;
}

const lireJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const lireTexte = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

export function executer(options, { log = console.log } = {}) {
  if (typeof options["env-file"] !== "string") throw new Refus("--env-file <studio.env> requis");
  if (typeof options["studio-ref"] !== "string") throw new Refus("--studio-ref <ref> requis (projet Supabase Studio Preview)");
  const env = chargerFichierEnv(options["env-file"]);
  const refStudio = options["studio-ref"];
  const constats = [...verifierEnvStudioPreview(env, { refStudio })];
  if (typeof options["worker-env-file"] === "string") constats.push(...verifierEnvWorkerStudioPreview(chargerFichierEnv(options["worker-env-file"]), env, { refStudio }));
  if (options["check-links"]) {
    constats.push(...verifierLiens({
      vercelProject: lireJson(resolve(ROOT, "apps/studio/.vercel/project.json")),
      refLieeStudio: lireTexte(resolve(ROOT, "apps/studio/supabase/.temp/project-ref")),
      refLieeRacine: lireTexte(resolve(ROOT, "supabase/.temp/project-ref")),
    }, { refStudio }));
  }
  log("ELSATIA Studio — garde de cible Preview dédiée (aucune valeur affichée)\n");
  for (const k of constats) log(ligne(k.ok ? "ok" : "ko", k.code, k.sujet, k.message));
  const ko = constats.filter((k) => !k.ok).length;
  log(ko ? `\nSTOP WRITES : ${ko} contrôle(s) en échec — aucune écriture distante.` : "\nGO : cible SUPABASE STUDIO PREVIEW + VERCEL STUDIO PREVIEW identifiée.");
  return ko ? SORTIE.NO_GO : SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  try {
    process.exitCode = executer(lireOptions(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; } else throw error;
  }
}
