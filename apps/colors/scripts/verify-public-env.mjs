/*
 * Garde de pré-déploiement des variables publiques d'ELSATIA Colors.
 *
 * Le mode de défaillance qu'elle ferme est propre à Next : `process.env.NEXT_PUBLIC_*` est
 * remplacé par une valeur littérale AU MOMENT DU BUILD. Un `next build` lancé sans ces variables
 * REUSSIT — il fige `undefined` — et livre un Colors cohérent mais amputé :
 *
 *  - `src/lib/supabase/cles.ts` ne peut plus construire de client : toute page du groupe
 *    `(colors)` tombe en erreur serveur, et le proxy avec elle ;
 *  - la CSP de `src/lib/security/en-tetes.ts` perd l'origine Supabase, donc `img-src` : les
 *    photos de seaux (URL signées Storage) ne s'affichent plus ;
 *  - `NEXT_PUBLIC_COLORS_URL` absente fait répondre « réinitialisation momentanément
 *    indisponible » à tout le monde, sans qu'aucun e-mail ne parte ;
 *  - `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` absente replie les renvois d'abonnement sur
 *    `http://localhost:3000/abonnement`, un lien mort pour l'utilisateur final.
 *
 * Aucun de ces quatre cas n'échoue au build. C'est exactement ce qu'un déploiement ne doit pas
 * pouvoir traverser en silence, et c'est pourquoi la garde s'exécute AVANT `next build`, via le
 * script npm `prebuild`.
 *
 * Elle ne lit rien d'autre que `process.env` et n'imprime JAMAIS de valeur : un message d'erreur
 * ne contient que des noms de variables et une raison catégorielle. Un journal de build Vercel
 * est consultable par toute personne ayant accès au projet ; y écrire une valeur reviendrait à
 * la divulguer, y compris l'URL Supabase, qui révèle la référence du projet.
 *
 * Elle est le pendant Colors de `apps/tools/scripts/verify-public-env.mjs`. Les deux gardes sont
 * volontairement jumelles dans leur structure, mais leur contrat est distinct : chacune décrit
 * ce que SON application lit réellement, jamais ce qu'on suppose partagé.
 */
import { fileURLToPath } from "node:url";

/** Mêmes valeurs que `EnvironnementApplications` dans `src/lib/routes-applications.ts`. */
export const MODES = ["local", "preview", "production"];

/** Seul mode réellement publié aujourd'hui : un manquement y est bloquant. */
export const MODES_BLOQUANTS = ["production"];

/** Une preview est jetable : elle mérite un avis, pas un blocage. */
export const MODES_CONSULTATIFS = ["preview"];

/**
 * Nom abandonné. Colors le lisait jusqu'à ce lot ; il n'est plus lu nulle part et n'est PAS
 * accepté en repli. Les clés JWT legacy (`anon` et `service_role`) ont été désactivées ensemble
 * au niveau du projet Supabase lors de SECURITY-CREDENTIALS-V1B/V1C : une valeur portée par
 * l'ancien nom n'authentifierait plus rien. L'accepter en secours convertirait une panne
 * d'authentification silencieuse en build vert — précisément ce que cette garde existe pour
 * fermer.
 */
export const VARIABLE_ABANDONNEE = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

/*
 * Contrat relevé dans le code de `apps/colors/src`, jamais supposé :
 *
 * - `NEXT_PUBLIC_SUPABASE_URL`             lue par `src/lib/supabase/cles.ts` (clients serveur et
 *                                          proxy) et par `construireCspColors` (origines
 *                                          `img-src` et `connect-src`).
 * - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` lue par `src/lib/supabase/cles.ts`. Convention unique
 *                                          de l'écosystème, déjà celle de Gestion Pro
 *                                          (`src/lib/supabase/keys.ts`), de Tools
 *                                          (`apps/tools/src/lib/auth/client.ts`) et du seul
 *                                          inventaire d'env versionné à la racine
 *                                          (`.env.example`).
 * - `NEXT_PUBLIC_COLORS_URL`               lue par `src/app/layout.tsx` (`metadataBase`) et par
 *                                          `urlCallbackReinitialisation()`, qui renvoie `null`
 *                                          sans elle : plus aucun e-mail de réinitialisation.
 * - `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`      lue par `Shell.tsx`, `/acces-refuse` et
 *                                          `/abonnement-requis`. Son repli
 *                                          `http://localhost:3000/abonnement` est correct en
 *                                          local et faux partout ailleurs : c'est un repli qui
 *                                          masque l'oubli au lieu de le signaler, donc la
 *                                          variable est requise et non recommandée.
 * - `ELSATIA_APPLICATION_ENV`              lue par `environnementApplications()`. Elle n'est pas
 *                                          publique — elle ne part pas dans le bundle — mais son
 *                                          absence produit la même classe de panne muette : le
 *                                          sélecteur d'applications retombe sur `url_locale` et
 *                                          propose `localhost` en Production. Elle est aussi la
 *                                          source de mode de cette garde, ce qui rend son
 *                                          absence doublement coûteuse.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` ne figure pas au contrat : c'est un secret serveur, la garde n'a
 * pas à en constater la présence, et le seul appelant (`createAdminStorageClient`) échoue déjà
 * par exception explicite. Ce que la garde vérifie à son sujet est l'inverse : qu'aucune valeur
 * de cette forme ne soit portée par une variable `NEXT_PUBLIC_*` (voir `secretsPublics`).
 */
export const CONTRAT_ENV_PUBLIC = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    kind: "url",
    level: "required",
    role: "plan de données Supabase et origines img-src / connect-src de la CSP",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    kind: "cle",
    level: "required",
    role: "clé publique du client Supabase (compte ELSATIA)",
  },
  {
    name: "NEXT_PUBLIC_COLORS_URL",
    kind: "url",
    level: "required",
    role: "origine publique de Colors (metadataBase, redirectTo de la réinitialisation)",
  },
  {
    name: "NEXT_PUBLIC_ELSATIA_ACCOUNT_URL",
    kind: "url",
    level: "required",
    role: "portail de compte et d'abonnement ELSATIA",
  },
  {
    name: "ELSATIA_APPLICATION_ENV",
    kind: "mode",
    level: "required",
    role: "cloisonnement d'environnement (URL du catalogue multi-app)",
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
  nomAbandonne: "nom abandonné, plus lu par l'application",
};

/**
 * Mode du build.
 *
 * Deux principes, dans cet ordre :
 *
 * 1. `VERCEL_ENV=production` est un FAIT de plateforme, pas une déclaration : ce build sera
 *    publié quoi qu'en dise le reste de l'environnement. Il l'emporte donc sur tout, y compris
 *    sur un `ELSATIA_APPLICATION_ENV` mal réglé — sans quoi une simple faute de saisie
 *    désarmerait la garde sur le seul build qui compte. `VERCEL_ENV` est déjà la source
 *    d'environnement de `next.config.ts` et de `src/lib/auth-mode.ts` à la racine : ce n'est pas
 *    une variable inventée ici.
 * 2. À défaut, l'environnement DECLARE par l'application (`ELSATIA_APPLICATION_ENV`) fait foi.
 *
 * Le repli final diverge volontairement de `environnementApplications()`, qui ramène l'inconnu à
 * `local`. Ce repli-là est sans danger : il choisit des URL de catalogue. Celui d'une garde
 * décide si un déploiement a le droit de partir sans authentification — s'y tromper dans le sens
 * permissif, c'est ne pas avoir de garde. Ne pas se déclarer vaut donc « publié ».
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
 * Une valeur publique ne doit jamais avoir la forme d'un secret. Trois formes sont refusées :
 * la clé secrète Supabase `sb_secret_...`, l'ancien JWT dont la charge déclare
 * `role: "service_role"`, et un bloc de clé privée PEM. La charge du JWT est décodée mais n'est
 * jamais imprimée ni retournée : seul un booléen sort d'ici.
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
    /*
     * `resoudreMode` a pu retenir « production » depuis `VERCEL_ENV` alors que l'application se
     * déclare ailleurs. Un build Production qui annonce `local` sert un sélecteur d'applications
     * pointant sur `localhost` : c'est incohérent, et muet.
     */
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
 * dans le bundle et servie à tous les navigateurs. Le contrat ne peut pas anticiper le nom que
 * prendrait une telle fuite, donc on ne s'y limite pas.
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
 * valeur : chaque entrée est `{ name, reason, role }`, où `name` est un nom de variable et
 * `reason` une constante de `RAISONS`.
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
    /*
     * Une variable seulement recommandée, ou un mode non bloquant, ne peut produire qu'un avis.
     * Seule exception : une clé publique en forme de secret bloque dans tous les modes, parce que
     * c'est une fuite et non un oubli — un build local la ferait fuir aussi.
     */
    if ((niveau === "bloquant" && entree.level === "required") || raison === RAISONS.formeSecrete) {
      failures.push(constat);
      continue;
    }
    /*
     * En mode ignoré, une variable absente ou vide est la situation normale du poste de
     * développement et ne mérite aucun bruit. Une valeur présente mais absurde — une URL qui n'en
     * est pas une, un mode inconnu — reste une faute de saisie quel que soit le mode.
     */
    const fauteDeSaisie = raison === RAISONS.pasUneUrl || raison === RAISONS.modeInconnu;
    if (niveau !== "ignore" || fauteDeSaisie) warnings.push(constat);
  }

  for (const fuite of secretsPublics(env)) {
    if (failures.some((constat) => constat.name === fuite.name)) continue;
    failures.push(fuite);
  }

  /*
   * L'ancien nom encore présent n'est plus qu'une variable morte : plus une seule ligne de
   * `apps/colors/src` ne la lit. Elle est donc signalée — deux conventions parallèles dans un
   * tableau de bord Vercel finissent toujours par en faire recopier une mauvaise — mais elle ne
   * bloque pas : un reliquat de configuration n'est pas une panne, et interrompre un déploiement
   * pour l'exiger reviendrait à faire dépendre la mise en ligne d'un ménage sans effet.
   */
  if (env[VARIABLE_ABANDONNEE] !== undefined) {
    warnings.push({
      name: VARIABLE_ABANDONNEE,
      reason: RAISONS.nomAbandonne,
      role: "remplacée par NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, sans repli",
    });
  }

  return { mode, niveau, failures, warnings, ok: failures.length === 0 };
}

/** Rapport lisible. Ne contient que des noms de variables, des raisons et des rôles figés. */
export function formaterRapport({ mode, niveau, failures, warnings }) {
  const lignes = [`ELSATIA Colors — variables publiques : mode « ${mode} » (${niveau}).`];
  for (const constat of failures) lignes.push(`  ERREUR  ${constat.name} : ${constat.reason} — ${constat.role}.`);
  for (const constat of warnings) lignes.push(`  AVIS    ${constat.name} : ${constat.reason} — ${constat.role}.`);
  if (failures.length) {
    lignes.push("");
    lignes.push("Build interrompu avant `next build`.");
    /*
     * Deux causes possibles, deux consignes opposées : une variable manquante se corrige en la
     * fournissant ou en déclarant un build non publié ; une valeur en forme de secret se corrige
     * en la retirant. Ne pas mélanger les deux messages évite de suggérer de publier un secret.
     */
    if (failures.some((constat) => constat.reason !== RAISONS.formeSecrete)) {
      lignes.push("Un build publié sans ces variables réussirait silencieusement et livrerait un");
      lignes.push("Colors sans authentification, sans photos et sans réinitialisation. Pour un");
      lignes.push("build local ou de recette, déclarer ELSATIA_APPLICATION_ENV=local.");
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
    console.log(`ELSATIA Colors — variables publiques : mode « ${resultat.mode} », contrôle non bloquant, rien à signaler.`);
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
