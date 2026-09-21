/*
 * Garde de pré-déploiement des variables publiques d'ELSATIA Réserves.
 *
 * Le mode de défaillance qu'elle ferme est propre à Next : `process.env.NEXT_PUBLIC_*` est
 * remplacé par une valeur littérale AU MOMENT DU BUILD. Un `next build` lancé sans ces variables
 * REUSSIT — il fige `undefined`, donc les replis du code — et livre un Réserves cohérent mais
 * amputé en silence :
 *
 *  - `src/lib/invitations.ts` (`urlApplicationReserves`) replie sur `http://localhost:3020` :
 *    chaque invitation envoyée par e-mail contient un lien mort pour son destinataire, sans
 *    qu'aucune étape du déploiement n'échoue ;
 *  - `src/app/layout.tsx` (`metadataBase`) replie sur la même origine locale ;
 *  - `src/proxy.ts` et `src/lib/supabase/server.ts` n'ont, eux, aucun repli sur
 *    `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (`!` non nul) : leur absence casse
 *    l'authentification à l'exécution plutôt qu'au build, un mode de défaillance différent mais
 *    tout aussi silencieux tant que personne ne s'est connecté.
 *
 * Aucun de ces cas n'échoue au build. C'est exactement ce qu'un déploiement ne doit pas pouvoir
 * traverser en silence, et c'est pourquoi la garde s'exécute AVANT `next build`, via le script npm
 * `prebuild`.
 *
 * Elle ne lit rien d'autre que `process.env` et n'imprime JAMAIS de valeur : un message d'erreur
 * ne contient que des noms de variables et une raison catégorielle.
 *
 * Elle est la jumelle de `apps/colors/scripts/verify-public-env.mjs` (même structure, même
 * indicateur d'environnement `ELSATIA_APPLICATION_ENV`/`VERCEL_ENV`) et de
 * `apps/tools/scripts/verify-public-env.mjs`. Le contrat, lui, est propre à Réserves : il décrit
 * ce que SON code lit réellement, jamais ce qu'on suppose partagé.
 */
import { fileURLToPath } from "node:url";

/** Mêmes valeurs que celles employées par le reste de l'écosystème (`config/env-manifest.json`). */
export const MODES = ["local", "preview", "production"];

/** Seul mode réellement publié aujourd'hui : un manquement y est bloquant. */
export const MODES_BLOQUANTS = ["production"];

/** Une preview est jetable : elle mérite un avis, pas un blocage. */
export const MODES_CONSULTATIFS = ["preview"];

/*
 * Contrat relevé dans le code de `apps/reserves/src`, jamais supposé :
 *
 * - `NEXT_PUBLIC_SUPABASE_URL`        lue par `src/proxy.ts`, `src/lib/supabase/server.ts` et
 *                                     `src/lib/supabase/admin.ts` (client Supabase, origine
 *                                     `connect-src` de la CSP construite par `src/proxy.ts`).
 * - `NEXT_PUBLIC_SUPABASE_ANON_KEY`   lue par `src/proxy.ts` et `src/lib/supabase/server.ts`.
 *                                     C'est le nom LEGACY, celui réellement lu par ce code
 *                                     (contrairement à Gestion Pro/Colors/Studio, qui lisent
 *                                     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) — documenté comme
 *                                     tel dans `apps/reserves/.env.example` et dans
 *                                     `config/env-manifest.json` (F-SUPABASE-PUBLIC-KEY-NAME).
 *                                     La VALEUR attendue est une clé publishable, jamais une clé
 *                                     de service : seul le NOM de variable diverge du reste de
 *                                     l'écosystème, pas sa nature.
 * - `NEXT_PUBLIC_RESERVES_URL`        lue par `src/lib/invitations.ts` (`urlApplicationReserves`)
 *                                     et par `src/app/layout.tsx` (`metadataBase`). Son repli
 *                                     `http://localhost:3020` est correct en local et faux partout
 *                                     ailleurs — chaque lien d'invitation envoyé par e-mail en
 *                                     hériterait, sans qu'aucun destinataire ne puisse deviner
 *                                     pourquoi le lien ne mène nulle part. C'est le repli que
 *                                     cette garde existe pour interdire sur un build publié.
 * - `ELSATIA_APPLICATION_ENV`         n'est lue par AUCUN code applicatif de Réserves aujourd'hui
 *                                     (contrairement à Gestion Pro et Colors) — mais c'est
 *                                     l'indicateur d'environnement canonique de l'écosystème
 *                                     (`config/env-manifest.json`, `scripts/lib/env-manifest-
 *                                     core.mjs`), déjà celui que cette garde reprend pour rester
 *                                     cohérente avec `apps/colors/scripts/verify-public-env.mjs`
 *                                     plutôt que d'inventer un second indicateur pour Réserves
 *                                     seule. Utilisée UNIQUEMENT par cette garde : aucun fichier
 *                                     de `src/` n'est modifié pour la lire.
 */
export const CONTRAT_ENV_PUBLIC = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    kind: "url",
    level: "required",
    role: "client Supabase (session, requêtes) et origine connect-src de la CSP",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    kind: "cle",
    level: "required",
    role: "clé publique du client Supabase (nom legacy propre à Réserves)",
  },
  {
    name: "NEXT_PUBLIC_RESERVES_URL",
    kind: "url",
    level: "required",
    role: "origine publique de Réserves (liens d'invitation par e-mail, metadataBase)",
  },
  {
    name: "ELSATIA_APPLICATION_ENV",
    kind: "mode",
    level: "required",
    role: "cloisonnement d'environnement (mode de cette garde)",
  },
];

/** Raisons possibles. Catégorielles : aucune ne peut contenir de valeur. */
export const RAISONS = {
  absente: "absente",
  vide: "définie mais vide",
  pasUneUrl: "n'est pas une URL http(s)",
  pasHttps: "doit être en https sur un build publié",
  modeInconnu: "valeur inconnue (attendu : local, preview ou production)",
  modeIncoherent: "déclare un environnement non Production sur un build Production",
  formeSecrete: "a la forme d'une clé de service ou privée (jamais publiable)",
};

/**
 * Mode du build. Reprend à l'identique la logique de
 * `apps/colors/scripts/verify-public-env.mjs::resoudreMode` :
 *
 * 1. `VERCEL_ENV=production` est un FAIT de plateforme : il l'emporte sur toute déclaration.
 * 2. À défaut, l'environnement DECLARE par `ELSATIA_APPLICATION_ENV` fait foi.
 * 3. À défaut, `VERCEL_ENV=preview`/`development` renseigne le mode.
 * 4. Ne pas se déclarer vaut « publié » : une garde qui ramènerait l'inconnu à `local` se
 *    désarmerait elle-même sur l'oubli qu'elle existe pour attraper.
 */
export function resoudreMode(env = process.env) {
  if (env.VERCEL_ENV === "production") return "production";
  if (MODES.includes(env.ELSATIA_APPLICATION_ENV)) return env.ELSATIA_APPLICATION_ENV;
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.VERCEL_ENV === "development") return "local";
  return "production";
}

/** `bloquant` interrompt le build, `consultatif` signale, `ignore` se tait. */
export function niveauApplication(mode) {
  if (MODES_BLOQUANTS.includes(mode)) return "bloquant";
  if (MODES_CONSULTATIFS.includes(mode)) return "consultatif";
  return "ignore";
}

/*
 * Une valeur publique ne doit jamais avoir la forme d'un secret. Mêmes trois formes refusées que
 * dans les gardes jumelles : la clé secrète Supabase `sb_secret_...`, l'ancien JWT dont la charge
 * déclare `role: "service_role"`, et un bloc de clé privée PEM.
 */
export function ressembleAUnSecret(valeur) {
  const nettoyee = valeur.trim();
  if (/^sb_secret_/i.test(nettoyee)) return true;
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(nettoyee)) return true;
  const segments = nettoyee.split(".");
  if (segments.length !== 3) return false;
  try {
    const charge = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    return charge?.role === "service_role";
  } catch {
    return false;
  }
}

/** Contrôle une seule variable du contrat. Retourne une raison de `RAISONS`, ou `null`. */
export function inspecterVariable(entree, valeurBrute, { exigerHttps, mode }) {
  if (valeurBrute === undefined) return RAISONS.absente;
  if (valeurBrute.trim() === "") return RAISONS.vide;
  const valeur = valeurBrute.trim();

  if (entree.kind === "cle") return ressembleAUnSecret(valeur) ? RAISONS.formeSecrete : null;

  if (entree.kind === "mode") {
    if (!MODES.includes(valeur)) return RAISONS.modeInconnu;
    if (mode === "production" && valeur !== "production") return RAISONS.modeIncoherent;
    return null;
  }

  let url;
  try {
    url = new URL(valeur);
  } catch {
    return RAISONS.pasUneUrl;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return RAISONS.pasUneUrl;
  if (exigerHttps && url.protocol !== "https:") return RAISONS.pasHttps;
  return null;
}

/**
 * Balayage de TOUTES les variables `NEXT_PUBLIC_*` présentes, pas seulement de celles du
 * contrat : une clé de service placée sous un nom public quelconque serait inscrite en clair
 * dans le bundle et servie à tous les navigateurs.
 */
export function secretsPublics(env = process.env) {
  const trouves = [];
  for (const [nom, valeur] of Object.entries(env)) {
    if (!nom.startsWith("NEXT_PUBLIC_")) continue;
    if (typeof valeur !== "string" || valeur.trim() === "") continue;
    if (!ressembleAUnSecret(valeur)) continue;
    trouves.push({ name: nom, reason: RAISONS.formeSecrete, role: "variable publique inscrite en clair dans le bundle" });
  }
  return trouves;
}

/**
 * Évalue l'environnement complet.
 *
 * `failures` interrompt le build, `warnings` ne l'interrompt pas. Aucun des deux ne transporte de
 * valeur : chaque entrée est `{ name, reason, role }`.
 */
export function evaluerEnvPublic(env = process.env, contrat = CONTRAT_ENV_PUBLIC) {
  const mode = resoudreMode(env);
  const niveau = niveauApplication(mode);
  const exigerHttps = niveau === "bloquant";
  const failures = [];
  const warnings = [];

  for (const entree of contrat) {
    const raison = inspecterVariable(entree, env[entree.name], { exigerHttps, mode });
    if (!raison) continue;
    const constat = { name: entree.name, reason: raison, role: entree.role };
    if ((niveau === "bloquant" && entree.level === "required") || raison === RAISONS.formeSecrete) {
      failures.push(constat);
      continue;
    }
    const fauteDeSaisie = raison === RAISONS.pasUneUrl || raison === RAISONS.modeInconnu;
    if (niveau !== "ignore" || fauteDeSaisie) warnings.push(constat);
  }

  for (const fuite of secretsPublics(env)) {
    if (failures.some((constat) => constat.name === fuite.name)) continue;
    failures.push(fuite);
  }

  return { mode, niveau, failures, warnings, ok: failures.length === 0 };
}

/** Rapport lisible. Ne contient que des noms de variables, des raisons et des rôles figés. */
export function formaterRapport({ mode, niveau, failures, warnings }) {
  const lignes = [`ELSATIA Réserves — variables publiques : mode « ${mode} » (${niveau}).`];
  for (const constat of failures) lignes.push(`  ERREUR  ${constat.name} : ${constat.reason} — ${constat.role}.`);
  for (const constat of warnings) lignes.push(`  AVIS    ${constat.name} : ${constat.reason} — ${constat.role}.`);
  if (failures.length) {
    lignes.push("");
    lignes.push("Build interrompu avant `next build`.");
    if (failures.some((constat) => constat.reason !== RAISONS.formeSecrete)) {
      lignes.push("Un build publié sans ces variables réussirait silencieusement et livrerait des");
      lignes.push("invitations pointant vers http://localhost:3020. Pour un build local ou de");
      lignes.push("recette, déclarer ELSATIA_APPLICATION_ENV=local.");
    }
    if (failures.some((constat) => constat.reason === RAISONS.formeSecrete)) {
      lignes.push("Une valeur NEXT_PUBLIC_* est inscrite en clair dans le bundle : retirer cette clé");
      lignes.push("et la remplacer par la clé publique correspondante. Aucun mode ne lève ce refus.");
    }
  }
  return lignes.join("\n");
}

function main() {
  const resultat = evaluerEnvPublic(process.env);
  if (resultat.niveau === "ignore" && resultat.ok && !resultat.warnings.length) {
    console.log(`ELSATIA Réserves — variables publiques : mode « ${resultat.mode} », contrôle non bloquant, rien à signaler.`);
    return;
  }
  const rapport = formaterRapport(resultat);
  if (resultat.ok) console.log(rapport);
  else {
    console.error(rapport);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
