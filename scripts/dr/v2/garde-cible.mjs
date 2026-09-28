// Garde-fou de cible pour l'outillage DR V2 (scripts/dr/v2/, `npm run dr:verify`).
//
// Principe : l'outillage DR est DESTRUCTIF par nature (il dépose et recrée des bases pour
// simuler des catastrophes). Il ne doit donc jamais pouvoir viser autre chose qu'une base
// locale jetable par simple erreur de variable d'environnement.
//
//   1. Production : REFUSÉE par défaut, toujours, quel que soit le mode. Détectée par le nom
//      de base, l'hôte, les variables d'environnement de l'application (VERCEL_ENV,
//      NODE_ENV, ELSATIA_ENV…) et toute référence de projet Supabase qui n'est pas la
//      référence Preview connue.
//   2. Cible distante (hôte non local) : refusée sauf autorisation EXPLICITE et exacte :
//      DR_ALLOW_REMOTE=1 ET l'hôte figure dans DR_REMOTE_ALLOWLIST (liste séparée par des
//      virgules, correspondance exacte). Même autorisée, une cible distante n'est jamais
//      acceptée pour un drill destructif : seulement pour la vérification non destructive
//      d'une sauvegarde (mode `verify-backup`), et jamais si elle ressemble à Production.
//   3. Base locale : le nom doit commencer par `elsatia_dr_` (convention des bases jetables
//      DR, déjà imposée par scripts/dr/lib/common.sh pour `elsatia_dr_drill*`).
//
// Module pur (aucun accès réseau ni base) : testé par garde-cible.test.mjs.

export const HOTES_LOCAUX = Object.freeze(["127.0.0.1", "localhost", "::1", ""]);
export const PREFIXE_BASE_DR = "elsatia_dr_";
export const REF_PREVIEW_CONNUE = "pgvvpqyjziyapbbkydmc";
export const MODES = Object.freeze(["drill", "verify-backup"]);

const MOTIFS_PRODUCTION = [/prod/i, /\blive\b/i, /^postgres$/i];

function estLocal(hote) {
  return HOTES_LOCAUX.includes(String(hote ?? "").trim().toLowerCase());
}

function refDepuisUrl(url) {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    const m = /^([a-z0-9]+)\.supabase\.co$/.exec(hostname) || /^db\.([a-z0-9]+)\.supabase\.co$/.exec(hostname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Indices de Production dans l'environnement d'exécution. Retourne la liste des motifs
 * (vide si aucun indice).
 */
export function indicesProduction(env = {}, cible = {}) {
  const indices = [];
  for (const cle of ["VERCEL_ENV", "ELSATIA_ENV", "APP_ENV", "NODE_ENV"]) {
    if (String(env[cle] ?? "").toLowerCase() === "production") indices.push(`${cle}=production`);
  }
  for (const cle of ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL"]) {
    const ref = refDepuisUrl(env[cle]);
    if (ref && ref !== REF_PREVIEW_CONNUE) indices.push(`${cle} vise le projet Supabase ${ref} (non Preview)`);
  }
  if (env.SUPABASE_PROJECT_REF && env.SUPABASE_PROJECT_REF !== REF_PREVIEW_CONNUE) {
    indices.push(`SUPABASE_PROJECT_REF=${env.SUPABASE_PROJECT_REF} (non Preview)`);
  }
  const base = String(cible.base ?? "");
  const hote = String(cible.hote ?? "");
  if (MOTIFS_PRODUCTION.some((m) => m.test(base))) indices.push(`nom de base « ${base} »`);
  if (/prod/i.test(hote)) indices.push(`hôte « ${hote} »`);
  if (/\.supabase\.co$/i.test(hote) || /pooler\.supabase\.com$/i.test(hote)) {
    const ref = refDepuisUrl(`https://${hote.replace(/^db\./, "")}`);
    if (ref !== REF_PREVIEW_CONNUE) indices.push(`hôte Supabase hébergé « ${hote} »`);
  }
  return indices;
}

/**
 * Décide si l'outillage DR peut opérer sur la cible.
 * @param {{hote?: string, base?: string, mode?: string}} cible
 * @param {Record<string,string|undefined>} env
 * @returns {{autorise: boolean, motif: string, distante?: boolean}}
 */
export function verifierCibleDr(cible = {}, env = {}) {
  const mode = cible.mode ?? "drill";
  if (!MODES.includes(mode)) return { autorise: false, motif: `Mode inconnu « ${mode} ».` };
  const base = String(cible.base ?? "").trim();
  if (!base) return { autorise: false, motif: "Base cible absente : cible non identifiable." };

  const prod = indicesProduction(env, cible);
  if (prod.length > 0) {
    return { autorise: false, motif: `Production refusée par défaut (indices : ${prod.join(" ; ")}).` };
  }

  if (!estLocal(cible.hote)) {
    if (env.DR_ALLOW_REMOTE !== "1") {
      return { autorise: false, motif: `Cible distante « ${cible.hote} » refusée : autorisation explicite requise (DR_ALLOW_REMOTE=1 et DR_REMOTE_ALLOWLIST).` };
    }
    const liste = String(env.DR_REMOTE_ALLOWLIST ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    if (!liste.includes(String(cible.hote).trim())) {
      return { autorise: false, motif: `Cible distante « ${cible.hote} » absente de DR_REMOTE_ALLOWLIST (correspondance exacte exigée).` };
    }
    if (mode !== "verify-backup") {
      return { autorise: false, motif: "Cible distante autorisée uniquement en mode verify-backup (non destructif) ; un drill ne s'exécute qu'en local." };
    }
    return { autorise: true, distante: true, motif: `Cible distante explicitement autorisée (${cible.hote}), mode non destructif.` };
  }

  if (!base.startsWith(PREFIXE_BASE_DR)) {
    return { autorise: false, motif: `Base locale « ${base} » refusée : le nom doit commencer par « ${PREFIXE_BASE_DR} » (base jetable DR).` };
  }
  return { autorise: true, distante: false, motif: `Base locale jetable « ${base} ».` };
}
