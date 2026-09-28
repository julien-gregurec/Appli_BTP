/**
 * ELSATIA — Commercialization Readiness Gate V1 : moteur pur.
 *
 * Le gate ne « déclare » rien : chaque point du registre (registry.mjs) porte un statut, une
 * priorité objective, une dépendance technique et des preuves. Le moteur :
 *   1. valide le registre (statuts fermés, aucun « TODO », dépendance obligatoire hors GO…) ;
 *   2. exécute les sondes de preuve (fichier du dépôt, fichier d'une branche distante déjà
 *      récupérée localement, constat du manifeste d'environnement, script npm, commande locale) ;
 *   3. rétrograde en NO-GO tout GO dont une preuve manque ;
 *   4. calcule un pourcentage PAR CATÉGORIE (jamais de score global) et le verdict.
 *
 * Aucun réseau : les sondes « ref » lisent des références git locales (`git show`), sans fetch.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const STATUTS = Object.freeze([
  "GO",
  "NO-GO",
  "DECISION_REQUIRED",
  "REMOTE_PROOF_REQUIRED",
  "MANUAL_REQUIRED",
  "NOT_APPLICABLE",
]);

export const CATEGORIES = Object.freeze([
  "CODE",
  "DATABASE",
  "SECURITY",
  "BILLING",
  "EMAIL",
  "LEGAL",
  "RGPD",
  "BACKUP_DR",
  "PREVIEW",
  "OBSERVABILITY",
  "PERFORMANCE",
  "MOBILE",
  "STUDIO",
  "TOOLS_RELEVE",
  "RESERVES",
  "COLORS",
  "OPERATIONS",
]);

export const BLOCKERS = Object.freeze([
  "BLOCKER_TECHNIQUE",
  "BLOCKER_REMOTE",
  "BLOCKER_LEGAL",
  "DECISION_REQUIRED",
  "MANUAL_VALIDATION",
]);

/** Classe de blocage par défaut d'un statut (NO-GO : technique sauf mention légale). */
const BLOCKER_PAR_STATUT = {
  "NO-GO": "BLOCKER_TECHNIQUE",
  DECISION_REQUIRED: "DECISION_REQUIRED",
  REMOTE_PROOF_REQUIRED: "BLOCKER_REMOTE",
  MANUAL_REQUIRED: "MANUAL_VALIDATION",
};

export const PRIORITES = Object.freeze({
  P0: "empêche objectivement la mise en vente ou expose un risque sécurité/data majeur",
  P1: "nécessaire avant ouverture clients",
  P2: "amélioration post-lancement possible",
});

export const VERDICT_PASS = "ELSATIA COMMERCIALIZATION GATE PASS";
export const VERDICT_NOT_PASSED = "ELSATIA COMMERCIALIZATION GATE NOT YET PASSED";

export class RegistreInvalide extends Error {}

const MOT_INTERDIT = /\bTODO\b|\bTBD\b|\bFIXME\b/i;

// ── Validation du registre ───────────────────────────────────────────────────
export function validerRegistre(items) {
  const erreurs = [];
  const ids = new Set();
  for (const it of items) {
    const ou = it?.id ?? "(sans id)";
    if (!it?.id || !/^[A-Z][A-Z0-9_]*-[A-Z0-9_-]+$/.test(it.id)) erreurs.push(`${ou} : id invalide`);
    if (ids.has(it.id)) erreurs.push(`${ou} : id en double`);
    ids.add(it.id);
    if (!CATEGORIES.includes(it.category)) erreurs.push(`${ou} : catégorie inconnue « ${it.category} »`);
    if (!STATUTS.includes(it.status)) erreurs.push(`${ou} : statut inconnu « ${it.status} »`);
    if (!it.title) erreurs.push(`${ou} : titre manquant`);
    if (!Array.isArray(it.evidence) || it.evidence.length === 0) erreurs.push(`${ou} : aucune preuve`);
    for (const champ of ["title", "rationale", "dependency"]) {
      if (typeof it[champ] === "string" && MOT_INTERDIT.test(it[champ])) erreurs.push(`${ou} : « TODO » interdit (${champ})`);
    }
    if (it.status !== "GO" && it.status !== "NOT_APPLICABLE") {
      if (!it.priority || !PRIORITES[it.priority]) erreurs.push(`${ou} : priorité P0/P1/P2 obligatoire hors GO`);
      if (!it.dependency) erreurs.push(`${ou} : dépendance technique obligatoire hors GO`);
      if (it.blocker && !BLOCKERS.includes(it.blocker)) erreurs.push(`${ou} : classe de blocage inconnue « ${it.blocker} »`);
      if (!it.owner) erreurs.push(`${ou} : porteur obligatoire hors GO`);
    }
    if (it.status === "NOT_APPLICABLE" && !it.rationale) erreurs.push(`${ou} : NOT_APPLICABLE sans justification`);
    for (const p of it.evidence ?? []) {
      if (!["file", "ref", "manifest-finding", "manifest-decision", "npm-script", "unchanged-since", "exec", "note"].includes(p.kind)) {
        erreurs.push(`${ou} : sonde inconnue « ${p.kind} »`);
      }
    }
  }
  if (erreurs.length) throw new RegistreInvalide(erreurs.join("\n"));
  return true;
}

// ── Sondes ───────────────────────────────────────────────────────────────────
function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

function contient(texte, motif) {
  if (motif == null) return true;
  if (motif instanceof RegExp) return motif.test(texte);
  return texte.includes(motif);
}

/**
 * Contexte d'exécution des sondes, injectable pour les tests.
 * - lireFichier(path) → string | null
 * - lireRef(ref, path) → string | null (null si la référence ou le fichier est absent localement)
 * - refPresente(ref) → bool
 * - inchangeDepuis(commit, paths) → { ok, ancetre }
 * - manifeste → objet config/env-manifest.json
 * - scripts → package.json scripts
 * - executions → { [nom]: { code, duree_s } } (sondes « exec », uniquement avec --run-code)
 */
export function contexteDepot(root, { executions = {} } = {}) {
  const cache = new Map();
  const manifestePath = resolve(root, "config/env-manifest.json");
  const pkgPath = resolve(root, "package.json");
  return {
    root,
    lireFichier(path) {
      const p = resolve(root, path);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    },
    refPresente(ref) {
      return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).ok;
    },
    lireRef(ref, path) {
      const cle = `${ref}:${path}`;
      if (!cache.has(cle)) {
        const r = git(root, ["show", cle]);
        cache.set(cle, r.ok ? r.out : null);
      }
      return cache.get(cle);
    },
    inchangeDepuis(commit, paths) {
      const ancetre = git(root, ["merge-base", "--is-ancestor", commit, "HEAD"]).ok;
      if (!ancetre) return { ok: false, ancetre: false };
      const diff = git(root, ["diff", "--quiet", commit, "HEAD", "--", ...paths]);
      const wt = git(root, ["diff", "--quiet", "HEAD", "--", ...paths]);
      return { ok: diff.ok && wt.ok, ancetre: true };
    },
    manifeste: existsSync(manifestePath) ? JSON.parse(readFileSync(manifestePath, "utf8")) : null,
    scripts: existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {} : {},
    executions,
  };
}

/** Exécute une sonde. Retourne { ok, detail, valeur? }. `ok:null` = non exécutée (information). */
export function sonder(p, ctx) {
  switch (p.kind) {
    case "file": {
      const t = ctx.lireFichier(p.path);
      if (t == null) return { ok: false, detail: `absent : ${p.path}` };
      if (!contient(t, p.contains)) return { ok: false, detail: `marqueur absent dans ${p.path} : ${String(p.contains)}` };
      return { ok: true, detail: `${p.path}${p.contains ? ` ⊃ « ${String(p.contains)} »` : ""}` };
    }
    case "ref": {
      if (!ctx.refPresente(p.ref)) return { ok: false, detail: `référence locale absente : ${p.ref} (à récupérer par l'opérateur ; le gate ne contacte jamais origin)` };
      const t = ctx.lireRef(p.ref, p.path);
      if (t == null) return { ok: false, detail: `absent sur ${p.ref} : ${p.path}` };
      if (!contient(t, p.contains)) return { ok: false, detail: `marqueur absent sur ${p.ref}:${p.path} : ${String(p.contains)}` };
      return { ok: true, detail: `${p.ref}:${p.path}${p.contains ? ` ⊃ « ${String(p.contains)} »` : ""}` };
    }
    case "manifest-finding": {
      const f = ctx.manifeste?.findings?.find((x) => x.id === p.id);
      if (!f) return { ok: false, detail: `constat ${p.id} absent du manifeste` };
      return { ok: true, detail: `manifeste ${p.id} : ${f.severity} ${f.status}`, valeur: f };
    }
    case "manifest-decision": {
      const d = ctx.manifeste?.decisions?.find((x) => x.id === p.id);
      if (!d) return { ok: false, detail: `décision ${p.id} absente du manifeste` };
      const tranchee = /^TRANCH[ÉE]E\b/i.test(d.question ?? "");
      return { ok: true, detail: `manifeste ${p.id} : ${tranchee ? "tranchée" : "ouverte"}`, valeur: { ...d, tranchee } };
    }
    case "npm-script": {
      const s = ctx.scripts?.[p.name];
      if (!s) return { ok: false, detail: `script npm absent : ${p.name}` };
      return { ok: true, detail: `npm run ${p.name}` };
    }
    case "unchanged-since": {
      const r = ctx.inchangeDepuis(p.commit, p.paths);
      if (!r.ancetre) return { ok: false, detail: `${p.commit} n'est pas un ancêtre de HEAD : la qualification ne couvre pas ce code` };
      if (!r.ok) return { ok: false, detail: `code modifié depuis ${p.commit} (${p.paths.join(", ")}) : la qualification ne s'applique plus` };
      return { ok: true, detail: `${p.paths.join(", ")} identiques à ${p.commit}` };
    }
    case "exec": {
      const e = ctx.executions?.[p.name];
      if (!e) return { ok: null, detail: `non exécuté dans ce run (npm run commercialization:check -- --run-code)` };
      return { ok: e.code === 0, detail: `${p.name} : code ${e.code} (${e.duree_s} s)`, valeur: e };
    }
    case "note":
      return { ok: true, detail: p.text };
    default:
      return { ok: false, detail: `sonde inconnue ${p.kind}` };
  }
}

// ── Évaluation ───────────────────────────────────────────────────────────────
export function evaluerPoint(it, ctx) {
  const preuves = it.evidence.map((p) => ({ ...p, contains: p.contains == null ? undefined : String(p.contains), ...sonder(p, ctx) }));
  const manquantes = preuves.filter((p) => p.ok === false && !p.optional);
  let status = it.status;
  let derive = null;
  if (typeof it.derive === "function") {
    derive = it.derive(preuves, ctx) ?? null;
    if (derive?.status) status = derive.status;
  }
  let integrite = null;
  // Un GO sans preuve complète n'existe pas : rétrogradé en NO-GO.
  if (status === "GO" && manquantes.length) {
    status = "NO-GO";
    integrite = `GO non prouvé : ${manquantes.map((p) => p.detail).join(" ; ")}`;
  }
  // Une commande locale exécutée en échec l'emporte sur le rapport.
  const execs = preuves.filter((p) => p.kind === "exec" && p.ok === false);
  if (status === "GO" && execs.length) {
    status = "NO-GO";
    integrite = `exécution locale en échec : ${execs.map((p) => p.detail).join(" ; ")}`;
  }
  const bloquant = status !== "GO" && status !== "NOT_APPLICABLE";
  return {
    id: it.id,
    category: it.category,
    title: it.title,
    declared_status: it.status,
    status,
    priority: bloquant ? derive?.priority ?? it.priority ?? "P0" : null,
    blocker: bloquant ? derive?.blocker ?? it.blocker ?? BLOCKER_PAR_STATUT[status] : null,
    dependency: bloquant ? derive?.dependency ?? it.dependency ?? integrite : null,
    owner: bloquant ? it.owner ?? null : null,
    rationale: derive?.rationale ?? it.rationale ?? null,
    integrity_error: integrite,
    proof_mode: preuves.some((p) => p.kind === "exec" && p.ok === true) ? "executed" : "evidence",
    evidence: preuves.map(({ kind, path, ref, id, name, commit, paths, text, contains, ok, detail }) => ({
      kind,
      ...(path ? { path } : {}),
      ...(ref ? { ref } : {}),
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(commit ? { commit } : {}),
      ...(paths ? { paths } : {}),
      ...(text ? { text } : {}),
      ...(contains ? { contains } : {}),
      ok,
      detail,
    })),
  };
}

export function syntheseCategories(points) {
  const out = {};
  for (const c of CATEGORIES) {
    const ps = points.filter((p) => p.category === c);
    const par = Object.fromEntries(STATUTS.map((s) => [s, ps.filter((p) => p.status === s).length]));
    const applicables = ps.length - par.NOT_APPLICABLE;
    const p0 = ps.filter((p) => p.priority === "P0").map((p) => p.id);
    out[c] = {
      total: ps.length,
      applicable: applicables,
      counts: par,
      go_percent: applicables ? Math.round((1000 * par.GO) / applicables) / 10 : null,
      open_p0: p0,
      // Un pourcentage élevé ne vaut rien si un P0 reste ouvert : l'état de la catégorie le dit.
      state: applicables === 0 ? "NOT_APPLICABLE" : par.GO === applicables ? "GO" : p0.length ? "BLOCKED_P0" : "OPEN",
    };
  }
  return out;
}

export function verdict(points, erreursIntegrite = []) {
  const ouverts = points.filter((p) => p.status !== "GO" && p.status !== "NOT_APPLICABLE");
  const pass = ouverts.length === 0 && erreursIntegrite.length === 0;
  const parClasse = Object.fromEntries(BLOCKERS.map((b) => [b, ouverts.filter((p) => p.blocker === b).map((p) => p.id)]));
  const parPriorite = Object.fromEntries(Object.keys(PRIORITES).map((k) => [k, ouverts.filter((p) => p.priority === k).map((p) => p.id)]));
  const raisons = pass
    ? []
    : [
        ...erreursIntegrite.map((e) => `INTEGRITY : ${e}`),
        ...ouverts
          .filter((p) => p.priority === "P0")
          .map((p) => `${p.id} [${p.status} · ${p.blocker} · P0] ${p.title} — dépend de : ${p.dependency}`),
      ];
  return {
    verdict: pass ? VERDICT_PASS : VERDICT_NOT_PASSED,
    pass,
    open_items: ouverts.length,
    by_blocker: parClasse,
    by_priority: parPriorite,
    reasons_p0: raisons,
  };
}

export function evaluerRegistre(items, ctx, meta = {}) {
  validerRegistre(items);
  const points = items.map((it) => evaluerPoint(it, ctx));
  const integrite = points.filter((p) => p.integrity_error && p.declared_status === "GO").map((p) => `${p.id} : ${p.integrity_error}`);
  const v = verdict(points, []);
  return {
    schema: "elsatia.commercialization-readiness/v1",
    ...meta,
    remote_calls: false,
    verdict: v.verdict,
    pass: v.pass,
    global_score: null,
    global_score_reason:
      "Aucun score global : une moyenne masquerait un NO-GO critique. Lire les catégories et la liste des P0.",
    categories: syntheseCategories(points),
    blockers: v.by_blocker,
    priorities: v.by_priority,
    reasons_p0: v.reasons_p0,
    integrity_downgrades: integrite,
    items: points,
  };
}

// ── Résumé lisible ───────────────────────────────────────────────────────────
const ICONE = { GO: "✅", "NO-GO": "⛔", DECISION_REQUIRED: "🟨", REMOTE_PROOF_REQUIRED: "🌐", MANUAL_REQUIRED: "✋", NOT_APPLICABLE: "·" };

export function resumeMarkdown(r) {
  const l = [];
  l.push(`# ELSATIA — Commercialization Readiness Gate V1 — résumé`);
  l.push("");
  l.push(`- Généré : ${r.generated_at ?? "—"} · HEAD \`${r.head ?? "—"}\` · base \`${r.base?.ref ?? "—"}\` @ \`${r.base?.commit ?? "—"}\``);
  l.push(`- Appels distants : **aucun** · preuves exécutées localement : ${r.run_code ? "oui (`--run-code`)" : "non (rapports + sondes du dépôt)"}`);
  if (r.reference_dates) l.push(`- Date d'activité déclarée : ${r.reference_dates.activity_start_declared} — ${r.reference_dates.note}`);
  l.push("");
  l.push(`## Verdict`);
  l.push("");
  l.push(`**${r.verdict}**`);
  l.push("");
  l.push(`Points ouverts : ${r.items.filter((p) => p.priority).length} — P0 : ${r.priorities.P0.length} · P1 : ${r.priorities.P1.length} · P2 : ${r.priorities.P2.length}. ${r.global_score_reason}`);
  l.push("");
  l.push(`## Catégories`);
  l.push("");
  l.push(`| Catégorie | GO / applicables | % GO | État | NO-GO | DECISION | REMOTE | MANUAL | N/A | P0 ouverts |`);
  l.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const [c, s] of Object.entries(r.categories)) {
    const pct = s.go_percent == null ? "—" : `${s.go_percent} %`;
    l.push(
      `| ${c} | ${s.counts.GO} / ${s.applicable} | ${pct} | ${s.state === "BLOCKED_P0" ? "**BLOCKED_P0**" : s.state} | ${s.counts["NO-GO"]} | ${s.counts.DECISION_REQUIRED} | ${s.counts.REMOTE_PROOF_REQUIRED} | ${s.counts.MANUAL_REQUIRED} | ${s.counts.NOT_APPLICABLE} | ${s.open_p0.length ? s.open_p0.join(", ") : "—"} |`,
    );
  }
  l.push("");
  l.push(`## Bloquants par classe`);
  for (const [b, ids] of Object.entries(r.blockers)) {
    l.push("");
    l.push(`### ${b} (${ids.length})`);
    l.push("");
    if (!ids.length) {
      l.push("_aucun_");
      continue;
    }
    l.push(`| ID | Prio | Statut | Point | Dépendance |`);
    l.push(`|---|---|---|---|---|`);
    for (const id of ids) {
      const p = r.items.find((x) => x.id === id);
      l.push(`| ${p.id} | ${p.priority} | ${ICONE[p.status]} ${p.status} | ${esc(p.title)} | ${esc(p.dependency)} |`);
    }
  }
  if (r.integrity_downgrades.length) {
    l.push("");
    l.push(`## GO rétrogradés faute de preuve`);
    l.push("");
    for (const e of r.integrity_downgrades) l.push(`- ${esc(e)}`);
  }
  l.push("");
  l.push(`## Détail`);
  for (const c of Object.keys(r.categories)) {
    const ps = r.items.filter((p) => p.category === c);
    if (!ps.length) continue;
    l.push("");
    l.push(`### ${c}`);
    l.push("");
    for (const p of ps) {
      l.push(`- ${ICONE[p.status]} **${p.id}** ${p.status}${p.priority ? ` · ${p.priority} · ${p.blocker}` : ""} — ${esc(p.title)}`);
    }
  }
  l.push("");
  return l.join("\n");
}

function esc(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
