// ELSATIA — Qualification Preview distante : fichier de cible et protection Production (§4).
//
// Pur : aucune I/O ici (le fichier est lu par l'orchestrateur). Le fichier de cible est une
// CONFIRMATION MACHINE-READABLE rédigée par l'opérateur, hors dépôt (~/elsatia-preview/preview-target.json),
// sur le modèle docs/qualification/preview-pack/preview-target.example.json. Il ne contient AUCUN secret :
// seulement des identifiants publics (ref Supabase, id de projet Vercel, id de compte Stripe, hôte
// Redis, adresses de l'allowlist de recette) et leur recopie dans `confirmations`.

import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE } from "../../lib/preview-guard.mjs";

export const SCHEMA_CIBLE = "elsatia.preview-target.v1";
export const APPS_WEB = ["gp", "tools", "colors", "reserves"];

/** Domaines de Production : jamais une cible de qualification, quelle que soit la configuration. */
export const DOMAINES_PRODUCTION = Object.freeze([
  "elsatia.fr", "www.elsatia.fr", "app.elsatia.fr", "tools.elsatia.fr", "colors.elsatia.fr",
  "reserves.elsatia.fr", "studio.elsatia.fr",
]);

/** Durée de validité d'une confirmation opérateur (une confirmation ancienne est refusée). */
export const VALIDITE_CONFIRMATION_MS = 7 * 24 * 3600 * 1000;

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hôte refusé comme Production ? (domaines listés ou tout sous-domaine elsatia.fr non autorisé.) */
export function estHoteProduction(hote, domainesPreviewAutorises = []) {
  const h = String(hote ?? "").toLowerCase().replace(/\.$/, "");
  if (DOMAINES_PRODUCTION.includes(h)) return true;
  if (h === "elsatia.fr" || h.endsWith(".elsatia.fr")) return !domainesPreviewAutorises.map((d) => d.toLowerCase()).includes(h);
  return false;
}

/**
 * Valide le fichier de cible. Renvoie { erreurs: string[], avertissements: string[] }.
 * Toute erreur = NO-GO critique (aucune écriture possible).
 */
export function validerCible(cible, { maintenant = Date.now(), refAutorisee = REF_PREVIEW_AUTORISEE } = {}) {
  const erreurs = [];
  const avertissements = [];
  const err = (m) => erreurs.push(m);
  if (!cible || typeof cible !== "object") return { erreurs: ["fichier de cible absent ou illisible"], avertissements };
  if (cible.schema !== SCHEMA_CIBLE) err(`schema ≠ ${SCHEMA_CIBLE}`);
  const conf = cible.confirmations ?? {};

  // Supabase.
  const ref = String(cible.supabase?.project_ref ?? "").toLowerCase();
  if (!ref) err("supabase.project_ref absent");
  else if (ref === REF_PRODUCTION_CONNUE) err("supabase.project_ref est la référence PRODUCTION : refus");
  else if (ref !== refAutorisee) err(`supabase.project_ref ≠ référence Preview autorisée par le dépôt (${refAutorisee}) — toute autre cible exige une revue de code du garde`);
  if (String(conf.supabase_project_ref ?? "").toLowerCase() !== ref) err("confirmations.supabase_project_ref ne recopie pas supabase.project_ref");

  // Vercel.
  const autorises = Array.isArray(cible.vercel?.allowed_custom_preview_domains) ? cible.vercel.allowed_custom_preview_domains : [];
  for (const d of autorises) if (DOMAINES_PRODUCTION.includes(String(d).toLowerCase())) err(`vercel.allowed_custom_preview_domains contient un domaine de Production (${d})`);
  const ids = [];
  for (const app of APPS_WEB) {
    const p = cible.vercel?.projects?.[app];
    if (!p) { err(`vercel.projects.${app} absent`); continue; }
    if (!/^prj_[A-Za-z0-9]+$/.test(String(p.project_id ?? ""))) err(`vercel.projects.${app}.project_id invalide (prj_… attendu)`);
    else ids.push(p.project_id);
    let hote = null;
    try {
      const u = new URL(String(p.preview_origin ?? ""));
      if (u.protocol !== "https:") err(`vercel.projects.${app}.preview_origin non HTTPS`);
      if (u.pathname !== "/" || u.search || u.hash) err(`vercel.projects.${app}.preview_origin doit être une origine (sans chemin)`);
      hote = u.hostname;
    } catch { err(`vercel.projects.${app}.preview_origin invalide`); }
    if (hote && estHoteProduction(hote, autorises)) err(`vercel.projects.${app}.preview_origin vise un domaine de Production (${hote})`);
    else if (hote && !hote.endsWith(".vercel.app") && !autorises.includes(hote)) err(`vercel.projects.${app}.preview_origin : domaine personnalisé ${hote} non listé dans vercel.allowed_custom_preview_domains`);
  }
  if (new Set(ids).size !== ids.length) err("vercel.projects : deux applications partagent le même project_id");
  const confIds = Array.isArray(conf.vercel_preview_projects) ? [...conf.vercel_preview_projects].sort() : [];
  if (JSON.stringify(confIds) !== JSON.stringify([...ids].sort())) err("confirmations.vercel_preview_projects ne recopie pas exactement les 4 project_id");

  // Stripe.
  if (cible.stripe?.mode !== "test") err("stripe.mode doit valoir \"test\"");
  if (conf.stripe_mode !== "sk_test") err("confirmations.stripe_mode doit valoir \"sk_test\"");
  if (!/^acct_[A-Za-z0-9]+$/.test(String(cible.stripe?.account_id ?? ""))) err("stripe.account_id invalide (acct_… attendu)");

  // Redis (facultatif : seul le worker Studio l'utilise ; Studio est hors périmètre V5).
  if (cible.redis) {
    if (cible.redis.environment !== "preview") err("redis.environment doit valoir \"preview\"");
    if (conf.redis_environment !== "preview") err("confirmations.redis_environment doit valoir \"preview\"");
    if (!cible.redis.host) err("redis.host absent");
  } else avertissements.push("redis non déclaré : contrôle Redis SKIPPED (worker Studio hors périmètre)");

  // Brevo.
  if (cible.brevo?.environment !== "recette") err("brevo.environment doit valoir \"recette\"");
  if (conf.brevo_environment !== "recette") err("confirmations.brevo_environment doit valoir \"recette\"");
  const allow = cible.brevo?.recipient_allowlist;
  if (!Array.isArray(allow) || !allow.length) err("brevo.recipient_allowlist vide : aucun e-mail ne sera envoyé sans allowlist");
  else for (const a of allow) if (!EMAIL_RE.test(String(a))) err("brevo.recipient_allowlist : adresse invalide");

  // Comptes de recette (mots de passe dans qualification.env, jamais ici).
  for (const t of ["tenant_a", "tenant_b"]) {
    const q = cible.qa?.[t];
    if (!q) { avertissements.push(`qa.${t} absent : Auth/Storage cross-tenant/Playwright authentifié SKIPPED`); continue; }
    if (!EMAIL_RE.test(String(q.email ?? ""))) err(`qa.${t}.email invalide`);
    if (!UUID_RE.test(String(q.entreprise_id ?? ""))) err(`qa.${t}.entreprise_id invalide (UUID attendu)`);
  }
  if (cible.qa?.tenant_a && cible.qa?.tenant_b && cible.qa.tenant_a.entreprise_id === cible.qa.tenant_b.entreprise_id) err("qa.tenant_a et qa.tenant_b doivent appartenir à deux entreprises différentes");

  // Signature et fraîcheur.
  if (!String(conf.confirmed_by ?? "").trim()) err("confirmations.confirmed_by absent");
  const quand = Date.parse(String(conf.confirmed_at ?? ""));
  if (Number.isNaN(quand)) err("confirmations.confirmed_at absent ou invalide (ISO 8601)");
  else if (quand > maintenant + 5 * 60 * 1000) err("confirmations.confirmed_at est dans le futur");
  else if (maintenant - quand > VALIDITE_CONFIRMATION_MS) err("confirmations.confirmed_at a plus de 7 jours : reconfirmer la cible");

  return { erreurs, avertissements };
}

/**
 * Recoupe la cible déclarée avec les identités OBSERVÉES (env, CLI, API). Chaque source absente
 * est ignorée ici (l'étape qui devait l'observer porte son propre statut) ; toute contradiction
 * est une erreur critique.
 *
 * observe = {
 *   supabaseRefs: { "gp.env": ref, "ELSATIA_PREVIEW_DB_URL": ref, "supabase/.temp/project-ref": ref, … },
 *   vercel: { gp: { projectId, target, url }, … },
 *   stripe: { typesCles: { "gp.STRIPE_SECRET_KEY": "test" }, accountId },
 *   redisHost, brevoEmail,
 *   envProduction: ["gp.env"]   // fichiers qui déclarent ELSATIA_APPLICATION_ENV/VERCEL_ENV=production
 * }
 */
export function recouperIdentites(cible, observe) {
  const erreurs = [];
  const ok = [];
  const ref = String(cible?.supabase?.project_ref ?? "").toLowerCase();
  for (const [source, r] of Object.entries(observe.supabaseRefs ?? {})) {
    if (!r) continue;
    if (r === REF_PRODUCTION_CONNUE) erreurs.push(`${source} vise la Supabase PRODUCTION`);
    else if (r !== ref) erreurs.push(`${source} vise un projet Supabase ≠ cible déclarée`);
    else ok.push(`${source} = Preview déclarée`);
  }
  for (const f of observe.envProduction ?? []) erreurs.push(`${f} déclare un environnement Production`);
  for (const [app, d] of Object.entries(observe.vercel ?? {})) {
    if (!d) continue;
    const attendu = cible?.vercel?.projects?.[app]?.project_id;
    if (d.target === "production") erreurs.push(`Vercel ${app} : le déploiement observé est un déploiement PRODUCTION`);
    if (attendu && d.projectId && d.projectId !== attendu) erreurs.push(`Vercel ${app} : le déploiement appartient à un autre projet que celui confirmé`);
    if (d.target !== "production" && (!attendu || d.projectId === attendu)) ok.push(`Vercel ${app} : déploiement Preview du projet confirmé`);
  }
  for (const [nom, type] of Object.entries(observe.stripe?.typesCles ?? {})) {
    if (type === "live") erreurs.push(`${nom} est une clé Stripe LIVE (sk_live/rk_live) : refus`);
    else if (type && type !== "test") erreurs.push(`${nom} : préfixe Stripe non reconnu`);
    else if (type === "test") ok.push(`${nom} : sk_test`);
  }
  if (observe.stripe?.accountId) {
    if (observe.stripe.accountId !== cible?.stripe?.account_id) erreurs.push("Stripe : le compte de la clé ≠ stripe.account_id confirmé");
    else ok.push("Stripe : compte Test confirmé");
  }
  if (observe.redisHost && cible?.redis?.host) {
    if (observe.redisHost.toLowerCase() !== String(cible.redis.host).toLowerCase()) erreurs.push("Redis : l'hôte de STUDIO_REDIS_URL ≠ redis.host confirmé");
    else ok.push("Redis : hôte Preview confirmé");
  }
  if (observe.brevoEmail && cible?.brevo?.account_email) {
    if (observe.brevoEmail.toLowerCase() !== String(cible.brevo.account_email).toLowerCase()) erreurs.push("Brevo : le compte de la clé ≠ brevo.account_email confirmé");
    else ok.push("Brevo : compte de recette confirmé");
  }
  return { erreurs, ok };
}

/** Une adresse est-elle autorisée à recevoir un e-mail de recette ? */
export function destinataireAutorise(cible, adresse) {
  const liste = (cible?.brevo?.recipient_allowlist ?? []).map((a) => String(a).trim().toLowerCase());
  return liste.includes(String(adresse ?? "").trim().toLowerCase());
}
