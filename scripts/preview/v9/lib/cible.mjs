// ELSATIA — Pack opérateur V9 : garde de cible (Phase B).
//
// Décide, sans réseau, si TOUTES les indications de cible disponibles désignent exactement la
// Preview `pgvvpqyjziyapbbkydmc`. Une seule indication divergente suffit à refuser.
// GARANTIE : le résultat ne contient que des références de projet (publiques), des noms de
// sources et des motifs ; jamais une URL complète, un mot de passe ou une clé.

import { BRANCHES_INTERDITES, HOTES_PRODUCTION, REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE, VERDICT } from "./constantes.mjs";

const REF_FORME = /^[a-z0-9]{20}$/;

/** Référence depuis une URL d'API (https://<ref>.supabase.co) ; null si autre forme. */
export function refDepuisApi(url) {
  try {
    const u = new URL(String(url).trim());
    const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
    return m ? m[1] : null;
  } catch { return null; }
}

/** Référence depuis une URL PostgreSQL Supabase (directe db.<ref>.supabase.co ou pooler postgres.<ref>). */
export function refDepuisDb(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  if (!/^postgres(?:ql)?:$/.test(u.protocol)) return null;
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
  if (direct) return direct[1];
  const pooler = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(u.username));
  if (pooler && /\.pooler\.supabase\.com$/.test(u.hostname)) return pooler[1];
  return null;
}

function hote(url) {
  try { return new URL(String(url).trim()).hostname.toLowerCase(); } catch { return null; }
}

/**
 * @param {object} p
 * @param {string} [p.ref]          référence explicite (--ref)
 * @param {string} [p.refLiee]      contenu de supabase/.temp/project-ref (projet lié par la CLI)
 * @param {string} [p.environment]  environnement déclaré par l'opérateur (--environment)
 * @param {string} [p.branche]      branche git courante
 * @param {string[]} [p.urlsApp]    URL d'application déclarées (--app-url) : jamais un hôte de Production
 * @param {Record<string,string|undefined>} [p.env] variables du processus
 * @returns {{ verdict: string, ok: boolean, ref: string|null, sources: string[], motifs: string[] }}
 */
export function evaluerCible({ ref, refLiee, environment, branche, urlsApp = [], env = {} } = {}) {
  const motifs = [];
  const indications = []; // { source, ref }
  const ajouter = (source, valeur, extraire) => {
    if (valeur === undefined || valeur === null) return;
    const brut = String(valeur);
    if (brut.trim() === "") { motifs.push(`${source} : valeur vide`); return; }
    const r = extraire ? extraire(brut) : brut.trim();
    if (r === null) { motifs.push(`${source} : forme non reconnue (URL ou hôte inconnu)`); return; }
    indications.push({ source, ref: r });
  };

  ajouter("--ref", ref);
  ajouter("supabase/.temp/project-ref", refLiee);
  ajouter("SUPABASE_PROJECT_REF", env.SUPABASE_PROJECT_REF);
  ajouter("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL, refDepuisApi);
  ajouter("ELSATIA_PREVIEW_DB_URL", env.ELSATIA_PREVIEW_DB_URL, refDepuisDb);

  if (!indications.length && !motifs.length) motifs.push("aucune référence de projet fournie : cible non identifiable");

  for (const { source, ref: r } of indications) {
    if (r === REF_PRODUCTION_CONNUE) motifs.push(`${source} désigne la PRODUCTION (${REF_PRODUCTION_CONNUE}) : refus absolu`);
    else if (!REF_FORME.test(r)) motifs.push(`${source} : référence de forme invalide`);
    else if (r !== REF_PREVIEW_AUTORISEE) motifs.push(`${source} : référence inconnue ${r} (seule ${REF_PREVIEW_AUTORISEE} est admise)`);
  }
  const distinctes = [...new Set(indications.map((i) => i.ref))];
  if (distinctes.length > 1) motifs.push(`indications contradictoires (${indications.map((i) => i.source).join(", ")})`);

  // Environnement déclaré ou détecté.
  if (environment !== undefined && environment !== "preview") motifs.push(`environment=${environment} : seul « preview » est admis`);
  for (const cle of ["VERCEL_ENV", "ELSATIA_APPLICATION_ENV", "ELSATIA_ENV", "APP_ENV", "NODE_ENV"]) {
    if (String(env[cle] ?? "").trim().toLowerCase() === "production") motifs.push(`${cle}=production détecté : refus`);
  }

  // URL d'application : jamais un hôte de Production, jamais une URL qui contient la référence Production.
  for (const u of urlsApp.filter(Boolean)) {
    const h = hote(u);
    if (!h) motifs.push("URL d'application illisible");
    else if (HOTES_PRODUCTION.includes(h)) motifs.push(`hôte de Production ${h} : refus`);
    else if (h.includes(REF_PRODUCTION_CONNUE)) motifs.push(`hôte ${h} contient la référence Production : refus`);
  }
  for (const [cle, v] of Object.entries(env)) {
    if (typeof v === "string" && v.includes(REF_PRODUCTION_CONNUE)) motifs.push(`${cle} contient la référence Production : refus`);
  }

  // Branche : jamais main / release / production.
  if (branche !== undefined) {
    if (!branche || branche === "HEAD") motifs.push("branche git indéterminée (HEAD détaché) : refus");
    else if (BRANCHES_INTERDITES.some((m) => m.test(branche))) motifs.push(`branche ${branche} interdite pour un cutover Preview`);
  }

  const motifsUniques = [...new Set(motifs)];
  const ok = motifsUniques.length === 0 && distinctes.length === 1;
  return {
    verdict: ok ? VERDICT.CIBLE_OK : VERDICT.CIBLE_KO,
    ok,
    ref: ok ? distinctes[0] : null,
    sources: indications.map((i) => i.source),
    motifs: motifsUniques,
  };
}
