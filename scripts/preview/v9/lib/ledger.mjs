// ELSATIA — Pack opérateur V9 : ledger distant vs train local (Phases C et D).
//
// Le ledger distant est TOUJOURS un fichier fourni (export local) : ce module ne se connecte à
// rien. Formats acceptés (détection automatique) :
//   1. JSON « elsatia-ledger-v1 » produit par docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql :
//      { format, project_ref?, fonction_813?: {original, non_original}, entries: [{version, name, marqueur_813?, sha256?}] }
//   2. JSON : tableau de versions (chaînes) ou d'objets { version, name?, sha256? } ;
//   3. texte de `supabase migration list --linked` (colonnes Local | Remote | Time) ;
//   4. texte `psql -At` : une version par ligne, ou `version|name`.
// « Checksum » : le ledger Supabase ne stocke AUCUNE somme ; quand un export fournit `sha256`
// (fixture, export fabriqué depuis les fichiers), elle est comparée au fichier local. Pour 813,
// la preuve de contenu est le marqueur de corps (constantes.mjs), lu dans `statements` du
// ledger et dans pg_proc par l'export SQL.

import {
  DERNIERE_FINALE, NB_A_APPLIQUER, NB_FINAL, NB_SOCLE, NOM_SOCLE, REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE,
  SHA256_813_NON_ORIGINAL, COMMIT_813_NON_ORIGINAL, VERDICT, VERSION_SOCLE,
} from "./constantes.mjs";

const VERSION = /^\d{14}$/;

export class ErreurLedger extends Error {}

function entree(e) {
  if (typeof e === "string" || typeof e === "number") return { version: String(e).trim(), name: null, sha256: null, marqueur813: null };
  if (!e || typeof e !== "object") throw new ErreurLedger("entrée de ledger illisible");
  return {
    version: String(e.version ?? "").trim(),
    name: e.name === undefined || e.name === null || e.name === "" ? null : String(e.name),
    sha256: e.sha256 ?? e.checksum ?? null,
    marqueur813: typeof e.marqueur_813 === "boolean" ? e.marqueur_813 : null,
  };
}

/** Analyse le texte d'un ledger exporté. */
export function lireLedger(texte) {
  const brut = String(texte ?? "").trim();
  if (!brut) throw new ErreurLedger("ledger vide");
  if (brut.startsWith("{") || brut.startsWith("[")) {
    let j;
    try { j = JSON.parse(brut); } catch { throw new ErreurLedger("JSON de ledger invalide"); }
    if (Array.isArray(j)) return { format: "json-liste", projectRef: null, fonction813: null, entries: j.map(entree) };
    if (!Array.isArray(j.entries)) throw new ErreurLedger("JSON de ledger sans tableau `entries`");
    return {
      format: j.format ?? "json",
      projectRef: j.project_ref ?? null,
      fonction813: j.fonction_813 && typeof j.fonction_813 === "object" ? { original: j.fonction_813.original === true, nonOriginal: j.fonction_813.non_original === true } : null,
      entries: j.entries.map(entree),
    };
  }
  const lignes = brut.split(/\r?\n/);
  // `supabase migration list` : « Local | Remote | Time » ; on lit la colonne Remote.
  if (lignes.some((l) => /\bLocal\b.*\|.*\bRemote\b/.test(l))) {
    const entries = [];
    for (const l of lignes) {
      const cols = l.split("|").map((s) => s.trim());
      if (cols.length < 2) continue;
      if (VERSION.test(cols[1])) entries.push(entree(cols[1]));
    }
    return { format: "supabase-migration-list", projectRef: null, fonction813: null, entries };
  }
  const entries = [];
  for (const l of lignes) {
    const s = l.trim();
    if (!s) continue;
    const [v, n] = s.split("|").map((x) => x.trim());
    if (!VERSION.test(v)) throw new ErreurLedger("ligne de ledger non reconnue (version à 14 chiffres attendue)");
    entries.push({ version: v, name: n || null, sha256: null, marqueur813: null });
  }
  return { format: "psql", projectRef: null, fonction813: null, entries };
}

/**
 * Compare le ledger distant au train local.
 * @param {ReturnType<typeof lireLedger>} ledger
 * @param {{version: string, name: string, sha256: string}[]} local
 * @param {{ attente?: "pre"|"post", exigerPreuve813?: boolean }} opts
 */
export function analyserLedger(ledger, local, { attente = "pre", exigerPreuve813 = false } = {}) {
  const divergences = [];
  const avertissements = [];
  const d = (code, detail) => divergences.push({ code, detail });
  const distant = ledger.entries;
  const versionsLocales = local.map((m) => m.version);
  const parVersion = new Map(local.map((m) => [m.version, m]));

  if (ledger.projectRef !== null && ledger.projectRef !== undefined) {
    if (ledger.projectRef === REF_PRODUCTION_CONNUE) d("LEDGER-REF-PRODUCTION", `ledger exporté depuis la PRODUCTION (${REF_PRODUCTION_CONNUE}) : refus`);
    else if (ledger.projectRef !== REF_PREVIEW_AUTORISEE) d("LEDGER-REF-INCONNUE", `ledger exporté depuis ${ledger.projectRef} (attendu ${REF_PREVIEW_AUTORISEE})`);
  }

  // Forme : versions à 14 chiffres, uniques, strictement croissantes.
  const malformees = distant.filter((e) => !VERSION.test(e.version)).map((e) => e.version || "<vide>");
  if (malformees.length) d("LEDGER-FORME", `version(s) mal formée(s) : ${malformees.slice(0, 5).join(", ")}`);
  const vus = new Set();
  const doublons = [];
  for (const e of distant) { if (vus.has(e.version)) doublons.push(e.version); vus.add(e.version); }
  if (doublons.length) d("LEDGER-DOUBLON", `version(s) en double : ${[...new Set(doublons)].join(", ")}`);
  for (let i = 1; i < distant.length; i += 1) {
    if (!(distant[i - 1].version < distant[i].version)) {
      d("LEDGER-ORDRE", `ordre incorrect à la position ${i + 1} : ${distant[i - 1].version} puis ${distant[i].version}`);
      break;
    }
  }

  // Versions étrangères (absentes du dépôt).
  const etrangeres = distant.filter((e) => VERSION.test(e.version) && !parVersion.has(e.version)).map((e) => e.version);
  if (etrangeres.length) d("LEDGER-ETRANGERE", `${etrangeres.length} version(s) absente(s) du train V9 : ${etrangeres.slice(0, 8).join(", ")}${etrangeres.length > 8 ? "…" : ""}`);

  // Noms et sommes, version par version.
  for (const e of distant) {
    const l = parVersion.get(e.version);
    if (!l) continue;
    if (e.name !== null && e.name !== l.name) d("LEDGER-NOM", `${e.version} : nom distant « ${e.name} » ≠ local « ${l.name} »`);
    if (e.sha256) {
      if (e.version === VERSION_SOCLE && e.sha256 === SHA256_813_NON_ORIGINAL) d("LEDGER-813-NON-ORIGINALE", `813 = reconstruction ${COMMIT_813_NON_ORIGINAL.slice(0, 8)} (sha256 194d1d…) : ce n'est PAS la 813 originale`);
      else if (e.sha256 !== l.sha256) d("LEDGER-CHECKSUM", `${e.version} : somme distante ≠ fichier local`);
    }
  }

  // Préfixe exact : le ledger doit être les N premières versions du train, sans trou.
  const versionsDistantes = distant.map((e) => e.version);
  const n = versionsDistantes.length;
  const ensembleDistant = new Set(versionsDistantes);
  const derniereDistante = [...versionsDistantes].sort().at(-1) ?? null;
  const trous = derniereDistante ? versionsLocales.filter((v) => v <= derniereDistante && !ensembleDistant.has(v)) : [];
  if (trous.length) d("LEDGER-TROU", `${trous.length} version(s) locale(s) antérieure(s) à ${derniereDistante} absente(s) du ledger : ${trous.slice(0, 8).join(", ")}${trous.length > 8 ? "…" : ""}`);
  const prefixeExact = n > 0 && n <= versionsLocales.length && versionsDistantes.every((v, i) => v === versionsLocales[i]);
  if (!prefixeExact && !divergences.some((x) => ["LEDGER-ORDRE", "LEDGER-ETRANGERE", "LEDGER-TROU", "LEDGER-DOUBLON", "LEDGER-FORME"].includes(x.code))) {
    d("LEDGER-PREFIXE", `le ledger (${n}) n'est pas un préfixe exact du train local`);
  }

  // 813 : présence, nom, preuve de contenu.
  const e813 = distant.find((e) => e.version === VERSION_SOCLE);
  if (!e813) d("LEDGER-813-ABSENTE", `${VERSION_SOCLE}_${NOM_SOCLE} absente du ledger`);
  else {
    const preuves = [];
    if (e813.marqueur813 === false) d("LEDGER-813-NON-ORIGINALE", "statements de 813 au ledger sans le marqueur de l'originale");
    if (e813.marqueur813 === true) preuves.push("statements du ledger");
    if (ledger.fonction813) {
      if (ledger.fonction813.nonOriginal) d("LEDGER-813-NON-ORIGINALE", `fonction plateforme_annuaire_entreprises déployée = reconstruction ${COMMIT_813_NON_ORIGINAL.slice(0, 8)} (marqueur « HOTFIX 813 »)`);
      else if (!ledger.fonction813.original) d("LEDGER-813-NON-ORIGINALE", "fonction plateforme_annuaire_entreprises déployée sans le marqueur de l'originale");
      else preuves.push("définition de fonction en base");
    }
    if (e813.sha256 && e813.sha256 === parVersion.get(VERSION_SOCLE)?.sha256) preuves.push("sha256");
    if (!preuves.length && !divergences.some((x) => x.code === "LEDGER-813-NON-ORIGINALE")) {
      if (exigerPreuve813) d("LEDGER-813-NON-PROUVEE", "contenu de 813 non prouvé (exporter avec docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql)");
      else avertissements.push("contenu de 813 non prouvé par ce fichier (version et nom seulement)");
    }
  }

  const enAttente = prefixeExact ? local.slice(n) : [];
  let verdict;
  if (divergences.length) verdict = VERDICT.LEDGER_DIVERGENCE;
  else if (n === NB_SOCLE) verdict = VERDICT.LEDGER_PREFIXE_OK;
  else if (n === NB_FINAL) verdict = VERDICT.LEDGER_V9_COMPLET;
  else if (n > NB_SOCLE && n < NB_FINAL) verdict = VERDICT.LEDGER_V9_PARTIEL;
  else { verdict = VERDICT.LEDGER_DIVERGENCE; d("LEDGER-SOCLE", `ledger de ${n} migrations : ni le socle ${NB_SOCLE}, ni le train ${NB_FINAL}`); }

  // Attente : « pre » n'admet que le socle 372 ; « post » n'admet que 389.
  let conforme;
  if (attente === "post") conforme = verdict === VERDICT.LEDGER_V9_COMPLET;
  else conforme = verdict === VERDICT.LEDGER_PREFIXE_OK && enAttente.length === NB_A_APPLIQUER;
  if (verdict === VERDICT.LEDGER_PREFIXE_OK && enAttente.length !== NB_A_APPLIQUER) {
    d("LEDGER-PENDING", `${enAttente.length} migration(s) en attente (attendu ${NB_A_APPLIQUER})`);
    verdict = VERDICT.LEDGER_DIVERGENCE;
    conforme = false;
  }
  return {
    verdict,
    conforme,
    attente,
    nbDistantes: n,
    derniereDistante,
    enAttente,
    divergences,
    avertissements,
  };
}

/**
 * Plan de migration (Phase D) : Preview actuelle → migrations à appliquer → état final.
 * Lève ErreurLedger si le ledger n'est pas EXACTEMENT le socle 372 (préfixe exact).
 */
export function planMigration(ledger, local, opts = {}) {
  const a = analyserLedger(ledger, local, { attente: "pre", ...opts });
  if (!a.conforme) {
    const detail = a.divergences.map((x) => `${x.code} ${x.detail}`).join(" ; ") || a.verdict;
    throw new ErreurLedger(`plan impossible : ${a.verdict} — ${detail}`);
  }
  const derniereLedger = a.derniereDistante;
  const anterieures = a.enAttente.filter((m) => m.version <= derniereLedger);
  const preuves = [
    { code: "PLAN-POSTERIEURES", ok: anterieures.length === 0, message: `aucune migration à appliquer antérieure ou égale à ${derniereLedger} (813)` },
    { code: "PLAN-SANS-INCLUDE-ALL", ok: anterieures.length === 0, message: "`supabase db push` sans --include-all (toutes les versions en attente sont postérieures au ledger)" },
    { code: "PLAN-HISTORIQUE-INTACT", ok: a.nbDistantes === NB_SOCLE && a.divergences.length === 0, message: `historique distant = ${NB_SOCLE} premières versions du train, aucune réécriture ni réparation de ledger` },
    { code: "PLAN-NB", ok: a.enAttente.length === NB_A_APPLIQUER, message: `${a.enAttente.length} migration(s) à appliquer (attendu ${NB_A_APPLIQUER})` },
    { code: "PLAN-DERNIERE", ok: a.enAttente.at(-1)?.version === DERNIERE_FINALE, message: `dernière migration finale = ${a.enAttente.at(-1)?.version} (attendu ${DERNIERE_FINALE})` },
    { code: "PLAN-TOTAL", ok: a.nbDistantes + a.enAttente.length === NB_FINAL, message: `total final = ${a.nbDistantes + a.enAttente.length} (attendu ${NB_FINAL})` },
  ];
  if (!preuves.every((p) => p.ok)) throw new ErreurLedger(`plan non prouvé : ${preuves.filter((p) => !p.ok).map((p) => p.code).join(", ")}`);
  return {
    depart: { nb: a.nbDistantes, derniere: derniereLedger },
    aAppliquer: a.enAttente.map((m, i) => ({ rang: a.nbDistantes + i + 1, version: m.version, name: m.name, fichier: m.fichier })),
    final: { nb: NB_FINAL, derniere: DERNIERE_FINALE },
    preuves,
    avertissements: a.avertissements,
  };
}

/** Plan en Markdown (lisible par l'opérateur). */
export function planMarkdown(plan) {
  const out = [
    `Preview actuelle : ${plan.depart.nb} migrations, dernière ${plan.depart.derniere}`,
    `→ ${plan.aAppliquer.length} migrations à appliquer, dans cet ordre :`,
    "",
    "| Rang | Version | Nom |",
    "|---|---|---|",
    ...plan.aAppliquer.map((m) => `| ${m.rang} | \`${m.version}\` | ${m.name} |`),
    "",
    `→ état final : ${plan.final.nb} migrations, dernière ${plan.final.derniere}`,
    "",
    "Preuves :",
    ...plan.preuves.map((p) => `- ${p.ok ? "✓" : "✖"} [${p.code}] ${p.message}`),
  ];
  return out.join("\n");
}

/**
 * Sortie de `supabase db push --dry-run` : versions annoncées, dans l'ordre, et refus de
 * toute mention de --include-all (la CLI la suggère quand une version locale est antérieure
 * au ledger distant : c'est une divergence, jamais une option à accepter).
 */
export function analyserDryRun(texte, plan) {
  const s = String(texte ?? "");
  const versions = [...s.matchAll(/(\d{14})_[A-Za-z0-9_]+\.sql/g)].map((m) => m[1]);
  const uniques = versions.filter((v, i) => versions.indexOf(v) === i);
  const motifs = [];
  if (/include-all/i.test(s)) motifs.push("la CLI réclame --include-all : historique non linéaire, ARRÊT (jamais --include-all)");
  if (/\bmigration repair\b/i.test(s)) motifs.push("la CLI suggère `migration repair` : ARRÊT (aucune réécriture du ledger)");
  const attendues = plan.aAppliquer.map((m) => m.version);
  if (uniques.length !== attendues.length) motifs.push(`${uniques.length} migration(s) annoncée(s) par le dry-run (attendu exactement ${attendues.length})`);
  else if (uniques.some((v, i) => v !== attendues[i])) motifs.push("le dry-run n'annonce pas exactement les migrations du plan, dans le même ordre");
  return { ok: motifs.length === 0, annoncees: uniques, motifs };
}
