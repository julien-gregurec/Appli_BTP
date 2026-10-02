/*
 * Garde de pre-deploiement des variables publiques d'ELSATIA Tools.
 *
 * Le probleme qu'elle ferme est enonce dans `src/lib/security-headers.test.ts` : Next fige les
 * `NEXT_PUBLIC_*` dans le bundle au moment du build. Un build Production lance sans elles
 * REUSSIT, et livre un Tools coherent mais amputé — `isElsatiaAccountConfigured()` est faux,
 * `monetizationConfigured()` est faux, la CSP se replie sur `connect-src 'self'`. Rien n'echoue,
 * ni au build ni au runtime : l'application se contente de ne plus proposer ni compte ni
 * abonnement. C'est exactement le mode de defaillance qu'un deploiement ne doit pas pouvoir
 * traverser en silence.
 *
 * La garde s'execute donc AVANT `next build`, via les scripts npm `prebuild` et `prebuild:native`.
 * Elle ne lit jamais autre chose que `process.env` et n'imprime JAMAIS de valeur : un message
 * d'erreur ne contient que des noms de variables et une raison categorielle.
 *
 * Le mode de build est celui de `src/lib/site.ts` (`getAppEnvironment`), a la lettre : une valeur
 * absente ou inconnue vaut `production`. Cette regle-la n'est pas un choix de cette garde, c'est
 * le contrat que l'application applique deja a elle-meme — un build qui ne se declare pas est
 * traite comme un build Production, et c'est ce qui rend la garde utile par defaut.
 */
import { fileURLToPath } from "node:url";

/** Memes valeurs que `APP_ENVIRONMENTS` dans `src/lib/site.ts`. */
export const APP_ENVIRONMENTS = ["local", "preview", "production", "native-dev", "native-production"];

/** Modes ou un manquement est bloquant : les deux builds reellement publies. */
export const ENFORCED_MODES = ["production", "native-production"];

/** Modes ou un manquement est signale sans bloquer : une preview reste un environnement jetable. */
export const ADVISORY_MODES = ["preview"];

/*
 * Contrat reel, releve dans le code et non suppose :
 *
 * - `NEXT_PUBLIC_SUPABASE_URL`      lue par `src/lib/auth/client.ts` et par `next.config.ts`
 *                                   (origine `connect-src` de la CSP).
 * - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` lue par `src/lib/auth/client.ts`. C'est la convention
 *                                   unique de l'ecosysteme, deja celle de Gestion Pro
 *                                   (`src/lib/supabase/keys.ts`) et du seul inventaire d'env
 *                                   versionne (`.env.example`). `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 *                                   n'est PAS acceptee en repli : les cles JWT legacy (`anon`,
 *                                   `service_role`) sont desactivees au niveau du projet Supabase
 *                                   depuis SECURITY-CREDENTIALS-V1B/V1C, donc une valeur portee
 *                                   par l'ancien nom n'authentifierait plus rien. Un repli
 *                                   transformerait cette panne d'authentification en build vert.
 * - `NEXT_PUBLIC_TOOLS_BILLING_API_URL` lue par `src/lib/monetization-client.ts` et par
 *                                   `next.config.ts`. Sans elle, `apiBase()` vaut `""` : le
 *                                   catalogue, le checkout, le portail et la verification des
 *                                   achats Apple/Google tapent une route relative que le domaine
 *                                   Tools n'heberge pas. Elle est donc requise sur les DEUX
 *                                   builds publies, natif compris.
 * - `NEXT_PUBLIC_TOOLS_URL`         lue par `src/lib/site.ts` (`getPublicUrl`). Elle a un repli
 *                                   correct (`https://tools.elsatia.fr`), donc elle est
 *                                   recommandee et non requise : son absence ne casse rien.
 */
export const PUBLIC_ENV_CONTRACT = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    kind: "url",
    level: "required",
    role: "compte ELSATIA (connexion, droits) et origine connect-src de la CSP",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    kind: "key",
    level: "required",
    role: "compte ELSATIA (client Supabase navigateur)",
  },
  {
    name: "NEXT_PUBLIC_TOOLS_BILLING_API_URL",
    kind: "url",
    level: "required",
    role: "abonnement Tools Pro (catalogue, checkout, portail, verification Apple/Google)",
  },
  {
    name: "NEXT_PUBLIC_TOOLS_URL",
    kind: "url",
    level: "recommended",
    role: "URL canonique publique (metadata, sitemap) — repli https://tools.elsatia.fr",
  },
];

/** Raisons possibles. Categorielles : aucune ne peut contenir de valeur. */
export const REASONS = {
  missing: "absente",
  blank: "definie mais vide",
  notUrl: "n'est pas une URL http(s)",
  notHttps: "doit etre en https en build publie",
  secretShaped: "a la forme d'une cle de service (jamais publiable)",
  unknownMode: "valeur inconnue (attendu : local, preview, production, native-dev ou native-production)",
  platformMismatch: "ne correspond pas a l'environnement Vercel du build (VERCEL_ENV)",
  productionHostInPreview: "pointe vers la Production ELSATIA (*.elsatia.fr) dans un build Preview",
  notProductionHost: "n'est pas un hote canonique ELSATIA (*.elsatia.fr) dans un build Production",
  navigationLinkHidden: "absente : le lien correspondant est masque dans cette Preview (jamais de repli Production)",
};

/*
 * TOOLS_ENV + A-08 (ELSATIA_SATELLITES_PREVIEW_READINESS_V2).
 *
 * - Une valeur de `NEXT_PUBLIC_TOOLS_ENV` presente mais inconnue BLOQUE, quel que soit le mode :
 *   `site.ts::resolveToolsEnv` la traiterait comme « aucun lien », et une faute de frappe sur un
 *   tableau de bord ne doit pas produire un build silencieusement ampute.
 * - Sur Vercel, le mode declare doit correspondre a `VERCEL_ENV` : un build Preview qui ne se
 *   declare pas `preview` serait un build Production servi sur une URL Preview (liens Production).
 * - Dans un build Preview, aucune URL publique ne peut viser un hote `*.elsatia.fr` ; dans un
 *   build Production, les liens d'application declares doivent viser un hote canonique.
 */
export const NAVIGATION_LINK_VARIABLES = ["NEXT_PUBLIC_TOOLS_GESTION_PRO_URL", "NEXT_PUBLIC_TOOLS_COLORS_URL"];
const CROSS_ENVIRONMENT_URL_VARIABLES = [...NAVIGATION_LINK_VARIABLES, "NEXT_PUBLIC_TOOLS_BILLING_API_URL", "NEXT_PUBLIC_TOOLS_URL"];
const PRODUCTION_MODES = ["production", "native-production"];

export function isElsatiaProductionHost(host) {
  const h = String(host).toLowerCase().replace(/\.$/, "");
  return h === "elsatia.fr" || h.endsWith(".elsatia.fr");
}

function hostOf(value) {
  try {
    return new URL(value.trim()).hostname;
  } catch {
    return null;
  }
}

/** Constats propres a l'environnement (mode et URLs inter-environnements). Jamais de valeur. */
export function environmentFindings(env, mode) {
  const failures = [];
  const warnings = [];
  const role = "navigation inter-applications et cloisonnement d'environnement";
  const declared = typeof env.NEXT_PUBLIC_TOOLS_ENV === "string" ? env.NEXT_PUBLIC_TOOLS_ENV.trim() : "";
  if (declared && !APP_ENVIRONMENTS.includes(declared)) {
    failures.push({ name: "NEXT_PUBLIC_TOOLS_ENV", reason: REASONS.unknownMode, role });
  }
  const vercel = typeof env.VERCEL_ENV === "string" ? env.VERCEL_ENV.trim() : "";
  if ((vercel === "preview" && mode !== "preview") || (vercel === "production" && !PRODUCTION_MODES.includes(mode))) {
    failures.push({ name: "NEXT_PUBLIC_TOOLS_ENV", reason: REASONS.platformMismatch, role });
  }
  for (const name of CROSS_ENVIRONMENT_URL_VARIABLES) {
    const value = env[name];
    if (typeof value !== "string" || !value.trim()) {
      if (mode === "preview" && NAVIGATION_LINK_VARIABLES.includes(name)) warnings.push({ name, reason: REASONS.navigationLinkHidden, role });
      continue;
    }
    const host = hostOf(value);
    if (!host) continue;
    if (mode === "preview" && isElsatiaProductionHost(host)) failures.push({ name, reason: REASONS.productionHostInPreview, role });
    if (PRODUCTION_MODES.includes(mode) && NAVIGATION_LINK_VARIABLES.includes(name) && !isElsatiaProductionHost(host)) {
      failures.push({ name, reason: REASONS.notProductionHost, role });
    }
  }
  return { failures, warnings };
}

/** Identique a `getAppEnvironment` de `src/lib/site.ts` : absente ou inconnue vaut `production`. */
export function resolveBuildMode(env = process.env) {
  const value = env.NEXT_PUBLIC_TOOLS_ENV;
  return APP_ENVIRONMENTS.includes(value) ? value : "production";
}

/** `enforced` bloque, `advisory` signale, `skipped` se tait. */
export function enforcementLevel(mode) {
  if (ENFORCED_MODES.includes(mode)) return "enforced";
  if (ADVISORY_MODES.includes(mode)) return "advisory";
  return "skipped";
}

/*
 * Une valeur publique ne doit jamais avoir la forme d'un secret. Deux formes connues de Supabase
 * sont refusees : la nouvelle cle secrete `sb_secret_...`, et l'ancien JWT dont la charge declare
 * `role: "service_role"`. La charge est decodee mais n'est jamais imprimee, ni retournee.
 */
export function looksLikeServiceSecret(value) {
  const trimmed = value.trim();
  if (/^sb_secret_/i.test(trimmed)) return true;
  const segments = trimmed.split(".");
  if (segments.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

/** Controle une seule variable. Retourne une raison de `REASONS`, ou `null` si elle est conforme. */
export function inspectVariable(entry, rawValue, { requireHttps }) {
  if (rawValue === undefined) return REASONS.missing;
  if (rawValue.trim() === "") return REASONS.blank;
  const value = rawValue.trim();
  if (entry.kind === "key") return looksLikeServiceSecret(value) ? REASONS.secretShaped : null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return REASONS.notUrl;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return REASONS.notUrl;
  if (requireHttps && url.protocol !== "https:") return REASONS.notHttps;
  return null;
}

/**
 * Evalue l'environnement complet.
 *
 * `failures` bloque le build, `warnings` ne le bloque pas. Aucun des deux ne transporte de valeur :
 * chaque entree est `{ name, reason, level }`, ou `name` est un nom de variable et `reason` une
 * constante de `REASONS`.
 */
export function evaluatePublicEnv(env = process.env, contract = PUBLIC_ENV_CONTRACT) {
  const mode = resolveBuildMode(env);
  const level = enforcementLevel(mode);
  const requireHttps = level === "enforced";
  const failures = [];
  const warnings = [];
  for (const entry of contract) {
    const reason = inspectVariable(entry, env[entry.name], { requireHttps });
    if (!reason) continue;
    const finding = { name: entry.name, reason, role: entry.role };
    /*
     * Une variable seulement recommandee, ou un mode non bloquant, ne peut produire qu'un avis.
     * Seule exception : une cle publique en forme de secret bloque dans tous les modes, parce que
     * c'est une fuite et non un oubli — un build local la ferait fuir aussi.
     */
    const blocking = level === "enforced" && entry.level === "required";
    if (blocking || reason === REASONS.secretShaped) {
      failures.push(finding);
      continue;
    }
    /*
     * En mode non bloquant (`local`, `native-dev`), une variable absente ou vide est la situation
     * normale et ne merite aucun bruit. Une valeur presente mais qui n'est pas une URL, elle, est
     * une erreur de saisie quel que soit le mode : elle est signalee.
     */
    if (level !== "skipped" || reason === REASONS.notUrl) warnings.push(finding);
  }
  const environment = environmentFindings(env, mode);
  failures.push(...environment.failures);
  warnings.push(...environment.warnings);
  return { mode, level, failures, warnings, ok: failures.length === 0 };
}

/** Rapport lisible. Ne contient que des noms de variables, des raisons et des roles figes. */
export function formatReport({ mode, level, failures, warnings }) {
  const lines = [`ELSATIA Tools — variables publiques : mode « ${mode} » (${level}).`];
  for (const finding of failures) lines.push(`  ERREUR  ${finding.name} : ${finding.reason} — ${finding.role}.`);
  for (const finding of warnings) lines.push(`  AVIS    ${finding.name} : ${finding.reason} — ${finding.role}.`);
  if (failures.length) {
    lines.push("");
    lines.push("Build interrompu avant `next build`.");
    /*
     * Deux causes possibles, deux consignes opposees : une variable manquante se corrige en la
     * fournissant ou en declarant un build non publie ; une valeur en forme de secret se corrige
     * en la retirant. Ne pas melanger les deux messages evite de suggerer de publier un secret.
     */
    if (failures.some((finding) => finding.reason !== REASONS.secretShaped)) {
      lines.push("Un build publie sans ces variables reussirait silencieusement et livrerait Tools");
      lines.push("sans compte ni abonnement. Pour un build local ou de recette, declarer");
      lines.push("NEXT_PUBLIC_TOOLS_ENV=local.");
    }
    if (failures.some((finding) => finding.reason === REASONS.secretShaped)) {
      lines.push("Une valeur NEXT_PUBLIC_* est inscrite en clair dans le bundle : retirer cette cle");
      lines.push("et la remplacer par la cle publique correspondante. Aucun mode ne leve ce refus.");
    }
  }
  return lines.join("\n");
}

function main() {
  const result = evaluatePublicEnv(process.env);
  if (result.level === "skipped" && result.ok && !result.warnings.length) {
    console.log(`ELSATIA Tools — variables publiques : mode « ${result.mode} », controle non bloquant, rien a signaler.`);
    return;
  }
  const report = formatReport(result);
  if (result.ok) console.log(report);
  else {
    console.error(report);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
