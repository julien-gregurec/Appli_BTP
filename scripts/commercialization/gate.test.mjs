// Tests hors réseau du Commercialization Readiness Gate V1.
// Lancer : node --test scripts/commercialization/gate.test.mjs   (npm run test:commercialization)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  CATEGORIES,
  contexteDepot,
  evaluerPoint,
  evaluerRegistre,
  RegistreInvalide,
  resumeMarkdown,
  STATUTS,
  validerRegistre,
  VERDICT_NOT_PASSED,
  VERDICT_PASS,
} from "./gate.mjs";
import { exigerBaseLocale, lireArgs } from "./check.mjs";
import { EXECUTIONS, REGISTRE } from "./registry.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

/** Contexte factice : aucun git, aucun disque. */
function ctxFactice({ fichiers = {}, refs = {}, findings = [], decisions = [], scripts = {}, inchange = true, executions = {} } = {}) {
  return {
    lireFichier: (p) => fichiers[p] ?? null,
    refPresente: (r) => r in refs,
    lireRef: (r, p) => refs[r]?.[p] ?? null,
    inchangeDepuis: () => ({ ok: inchange, ancetre: true }),
    manifeste: { findings, decisions },
    scripts,
    executions,
  };
}

const go = (id, extra = {}) => ({
  id,
  category: "CODE",
  title: `point ${id}`,
  status: "GO",
  evidence: [{ kind: "file", path: "a.md", contains: "QUALIFIED" }],
  ...extra,
});

const nogo = (id, extra = {}) => ({
  id,
  category: "LEGAL",
  title: `point ${id}`,
  status: "NO-GO",
  priority: "P0",
  owner: "Exploitant",
  dependency: "dépendance nommée",
  evidence: [{ kind: "note", text: "constat" }],
  ...extra,
});

// ── Registre ─────────────────────────────────────────────────────────────────
test("registre réel : valide, toutes les catégories de la mission couvertes", () => {
  assert.equal(validerRegistre(REGISTRE), true);
  for (const c of CATEGORIES) assert.ok(REGISTRE.some((it) => it.category === c), `catégorie vide : ${c}`);
  assert.equal(CATEGORIES.length, 17);
});

test("registre : statuts fermés, aucun TODO, dépendance et priorité obligatoires hors GO", () => {
  assert.throws(() => validerRegistre([go("CODE-X", { status: "TODO" })]), RegistreInvalide);
  assert.throws(() => validerRegistre([nogo("LEGAL-X", { dependency: "TODO plus tard" })]), /TODO/);
  assert.throws(() => validerRegistre([nogo("LEGAL-X", { dependency: undefined })]), /dépendance/);
  assert.throws(() => validerRegistre([nogo("LEGAL-X", { priority: "P3" })]), /priorité/);
  assert.throws(() => validerRegistre([nogo("LEGAL-X", { owner: undefined })]), /porteur/);
  assert.throws(() => validerRegistre([go("CODE-X", { category: "MARKETING" })]), /catégorie/);
  assert.throws(() => validerRegistre([go("CODE-X"), go("CODE-X")]), /double/);
  assert.throws(() => validerRegistre([go("CODE-X", { evidence: [] })]), /aucune preuve/);
  assert.throws(
    () => validerRegistre([{ ...go("CODE-X"), status: "NOT_APPLICABLE", rationale: undefined }]),
    /NOT_APPLICABLE sans justification/,
  );
  assert.deepEqual(STATUTS, ["GO", "NO-GO", "DECISION_REQUIRED", "REMOTE_PROOF_REQUIRED", "MANUAL_REQUIRED", "NOT_APPLICABLE"]);
});

test("registre réel : chaque point non GO porte priorité, classe, dépendance et porteur", () => {
  for (const it of REGISTRE) {
    if (it.status === "GO" || it.status === "NOT_APPLICABLE") continue;
    assert.ok(["P0", "P1", "P2"].includes(it.priority), it.id);
    assert.ok(it.dependency?.length > 10, it.id);
    assert.ok(it.owner, it.id);
  }
});

// ── Preuves ──────────────────────────────────────────────────────────────────
test("un GO dont la preuve manque est rétrogradé en NO-GO", () => {
  const p = evaluerPoint(go("CODE-A"), ctxFactice());
  assert.equal(p.status, "NO-GO");
  assert.match(p.integrity_error, /GO non prouvé/);
  assert.equal(p.priority, "P0");
  const ok = evaluerPoint(go("CODE-A"), ctxFactice({ fichiers: { "a.md": "X QUALIFIED" } }));
  assert.equal(ok.status, "GO");
  assert.equal(ok.priority, null);
});

test("un marqueur absent du rapport rétrograde aussi", () => {
  const p = evaluerPoint(go("CODE-A"), ctxFactice({ fichiers: { "a.md": "BLOCKED" } }));
  assert.equal(p.status, "NO-GO");
});

test("sonde ref : lit une branche locale, ne fetch jamais", () => {
  const it = go("CODE-B", { evidence: [{ kind: "ref", ref: "origin/x", path: "r.md", contains: "READY" }] });
  assert.equal(evaluerPoint(it, ctxFactice()).status, "NO-GO");
  assert.match(evaluerPoint(it, ctxFactice()).evidence[0].detail, /le gate ne contacte jamais origin/);
  assert.equal(evaluerPoint(it, ctxFactice({ refs: { "origin/x": { "r.md": "READY" } } })).status, "GO");
});

test("sonde unchanged-since : un code modifié depuis la qualification invalide le GO", () => {
  const it = go("CODE-C", { evidence: [{ kind: "unchanged-since", commit: "abc", paths: ["src"] }] });
  assert.equal(evaluerPoint(it, ctxFactice({ inchange: true })).status, "GO");
  assert.equal(evaluerPoint(it, ctxFactice({ inchange: false })).status, "NO-GO");
});

test("sonde exec : un échec local l'emporte sur le rapport ; non exécutée = sans effet", () => {
  const it = go("CODE-D", { evidence: [{ kind: "note", text: "rapport" }, { kind: "exec", name: "lint" }] });
  assert.equal(evaluerPoint(it, ctxFactice()).status, "GO");
  assert.equal(evaluerPoint(it, ctxFactice()).proof_mode, "evidence");
  const ko = evaluerPoint(it, ctxFactice({ executions: { lint: { code: 1, duree_s: 1 } } }));
  assert.equal(ko.status, "NO-GO");
  const ok = evaluerPoint(it, ctxFactice({ executions: { lint: { code: 0, duree_s: 1 } } }));
  assert.equal(ok.proof_mode, "executed");
});

test("derive : un point peut basculer automatiquement selon le dépôt", () => {
  const it = nogo("LEGAL-D", {
    evidence: [{ kind: "file", path: "src/x.ts", optional: true }],
    derive: (p) => (p[0].ok ? { status: "GO" } : null),
  });
  assert.equal(evaluerPoint(it, ctxFactice()).status, "NO-GO");
  assert.equal(evaluerPoint(it, ctxFactice({ fichiers: { "src/x.ts": "" } })).status, "GO");
});

// ── Verdict et catégories ────────────────────────────────────────────────────
test("verdict PASS seulement si tout est GO ou NOT_APPLICABLE", () => {
  const ctx = ctxFactice({ fichiers: { "a.md": "QUALIFIED" } });
  const pass = evaluerRegistre([go("CODE-A"), { ...go("CODE-B"), status: "NOT_APPLICABLE", rationale: "hors périmètre" }], ctx);
  assert.equal(pass.verdict, VERDICT_PASS);
  assert.equal(pass.pass, true);
  for (const s of ["NO-GO", "DECISION_REQUIRED", "REMOTE_PROOF_REQUIRED", "MANUAL_REQUIRED"]) {
    const r = evaluerRegistre([go("CODE-A"), nogo("LEGAL-B", { status: s, priority: "P2" })], ctx);
    assert.equal(r.verdict, VERDICT_NOT_PASSED, s);
  }
});

test("aucun score global ; une catégorie à 90 % avec un P0 ouvert reste BLOCKED_P0", () => {
  const ctx = ctxFactice({ fichiers: { "a.md": "QUALIFIED" } });
  const items = [
    ...Array.from({ length: 9 }, (_, i) => go(`CODE-G${i}`, { category: "LEGAL" })),
    nogo("LEGAL-P0"),
  ];
  const r = evaluerRegistre(items, ctx);
  assert.equal(r.global_score, null);
  assert.equal(r.categories.LEGAL.go_percent, 90);
  assert.equal(r.categories.LEGAL.state, "BLOCKED_P0");
  assert.deepEqual(r.categories.LEGAL.open_p0, ["LEGAL-P0"]);
  assert.match(r.reasons_p0[0], /LEGAL-P0/);
  assert.deepEqual(r.blockers.BLOCKER_TECHNIQUE, ["LEGAL-P0"]);
  const md = resumeMarkdown(r);
  assert.match(md, /NOT YET PASSED/);
  assert.match(md, /BLOCKED_P0/);
});

test("classes de blocage par défaut selon le statut", () => {
  const ctx = ctxFactice();
  const r = evaluerRegistre(
    [
      nogo("LEGAL-A", { blocker: "BLOCKER_LEGAL" }),
      nogo("LEGAL-B", { status: "REMOTE_PROOF_REQUIRED" }),
      nogo("LEGAL-C", { status: "DECISION_REQUIRED" }),
      nogo("LEGAL-E", { status: "MANUAL_REQUIRED" }),
    ],
    ctx,
  );
  assert.deepEqual(r.blockers.BLOCKER_LEGAL, ["LEGAL-A"]);
  assert.deepEqual(r.blockers.BLOCKER_REMOTE, ["LEGAL-B"]);
  assert.deepEqual(r.blockers.DECISION_REQUIRED, ["LEGAL-C"]);
  assert.deepEqual(r.blockers.MANUAL_VALIDATION, ["LEGAL-E"]);
});

// ── Dépôt réel ───────────────────────────────────────────────────────────────
test("dépôt réel : le gate s'évalue sans erreur de registre et ne passe pas tant que des P0 sont ouverts", () => {
  const r = evaluerRegistre(REGISTRE, contexteDepot(ROOT));
  assert.equal(r.remote_calls, false);
  assert.equal(r.global_score, null);
  assert.equal(Object.keys(r.categories).length, 17);
  if (r.priorities.P0.length) assert.equal(r.verdict, VERDICT_NOT_PASSED);
});

// ── Garde-fous CLI ───────────────────────────────────────────────────────────
test("CLI : options fermées", () => {
  assert.deepEqual(lireArgs(["--run-code", "--only", "lint,typecheck"]).only, ["lint", "typecheck"]);
  assert.throws(() => lireArgs(["--production"]), /option inconnue/);
});

test("--run-db : base locale jetable elsatia_gate_* uniquement", () => {
  assert.equal(exigerBaseLocale("postgresql://postgres:x@127.0.0.1/elsatia_gate_fresh"), "elsatia_gate_fresh");
  assert.throws(() => exigerBaseLocale("postgresql://postgres:x@db.abc.supabase.co/postgres"), /hôte non local/);
  assert.throws(() => exigerBaseLocale("postgresql://postgres:x@127.0.0.1/postgres"), /hors préfixe/);
  assert.throws(() => exigerBaseLocale("pas une url"), /invalide/);
});

test("aucun appel réseau dans le code du gate", () => {
  for (const f of ["gate.mjs", "check.mjs", "registry.mjs"]) {
    // Code seul : les commentaires décrivent justement ce qui est interdit.
    const src = readFileSync(resolve(import.meta.dirname, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\bfetch\(|node:https?|node:net|node:dgram|["']fetch["'],\s*["']origin/, f);
    assert.doesNotMatch(src, /\bgit\b[^\n]*\bfetch\b|\bpush\b.*origin|vercel\s+deploy|supabase\s+db\s+push/, f);
  }
  for (const def of Object.values(EXECUTIONS)) {
    assert.doesNotMatch([def.cmd, ...def.args].join(" "), /preview:|deploy|db push|smoke|stripe-verify|--brevo-send/);
  }
});
