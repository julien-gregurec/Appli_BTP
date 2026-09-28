// Tests hors réseau de l'orchestrateur de qualification Preview distante.
// Lancer : node --test scripts/preview/qualification/qualification.test.mjs   (npm run test:preview-qualification)
//
// Aucun appel distant : le runtime est remplacé par un faux qui simule Supabase, Vercel, Stripe,
// Brevo, psql, pg_dump, la CLI Supabase et Playwright, et ÉCHOUE sur toute requête non prévue.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE } from "../lib/preview-guard.mjs";
import { versionsLocales } from "../db-verify.mjs";
import * as core from "./lib/core.mjs";
import * as cible from "./lib/target.mjs";
import * as db from "./lib/database.mjs";
import { repertoireSauvegardeAutorise } from "./steps/database.mjs";
import { ecrireDotenv, variablesPreview } from "./steps/preflight.mjs";
import { parseEnvFile } from "../../lib/env-manifest-preflight.mjs";
import { analyserLogsVercel, echecsPlaywright, statsPlaywright } from "./steps/e2e-logs.mjs";
import { codeSortie, construireMasque, lireOptionsQualification, qualifier, toutesEtapes } from "./run.mjs";

const ROOT = resolve(import.meta.dirname, "../../..");
const REF = REF_PREVIEW_AUTORISEE;
const HEAD = "a".repeat(40);
const TRAIN = JSON.parse(readFileSync(resolve(import.meta.dirname, "train.json"), "utf8"));
// Valeurs factices construites à l'exécution (le scanner de secrets ne doit rien voir ici).
const faux = (...p) => p.join("_");
const CLE_TEST = faux("sk", "test", "Q".repeat(24));
const CLE_LIVE = faux("sk", "live", "L".repeat(24));
const SERVICE = `eyJhbGciOiJIUzI1NiJ9.${"s".repeat(30)}.${"t".repeat(30)}`;
const PUBLIQUE = faux("sb", "publishable", "p".repeat(24));
const MDP_DB = `mdp-db-${"z".repeat(16)}`;
const BREVO = `xkeysib-${"b".repeat(40)}`;
const VERCEL = `vercel-${"v".repeat(24)}`;
const MDP_A = `mdp-a-${"x".repeat(16)}`;
const MDP_B = `mdp-b-${"y".repeat(16)}`;
const ENT_A = "11111111-1111-4111-8111-111111111111";
const ENT_B = "22222222-2222-4222-8222-222222222222";
const APPS = ["gp", "tools", "colors", "reserves"];
const MAINTENANT = Date.parse("2026-09-29T08:00:00Z");

function cibleValide() {
  const projets = Object.fromEntries(APPS.map((a, i) => [a, { project_id: `prj_${a}${i}`, project_name: `elsatia-${a}-preview`, preview_origin: `https://elsatia-${a}-git-train-v5.vercel.app` }]));
  return {
    schema: cible.SCHEMA_CIBLE,
    train: "V5",
    supabase: { project_ref: REF, project_name: "elsatia-preview" },
    vercel: { team_id: "team_x", allowed_custom_preview_domains: [], projects: projets },
    stripe: { account_id: "acct_TEST123", mode: "test" },
    brevo: { environment: "recette", account_email: "recette@exemple.fr", recipient_allowlist: ["qa-a@exemple.fr"] },
    qa: {
      tenant_a: { email: "qa-a@exemple.fr", entreprise_id: ENT_A, apps: ["gp", "colors", "reserves"] },
      tenant_b: { email: "qa-b@exemple.fr", entreprise_id: ENT_B, apps: ["gp"] },
    },
    confirmations: {
      supabase_project_ref: REF, vercel_preview_projects: APPS.map((a, i) => `prj_${a}${i}`), stripe_mode: "sk_test",
      brevo_environment: "recette", confirmed_by: "Opérateur", confirmed_at: "2026-09-29T07:00:00Z",
    },
  };
}

function envApp(extra = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLIQUE, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    ELSATIA_APPLICATION_ENV: "preview", ...extra,
  };
}

function entrees({ gp = {}, dbUrl = `postgresql://postgres.${REF}:${MDP_DB}@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`, target = cibleValide() } = {}) {
  return {
    envs: {
      gp: envApp({ STRIPE_SECRET_KEY: CLE_TEST, BREVO_API_KEY: BREVO, EMAIL_FROM_ADDRESS: "noreply@exemple.fr", ...gp }),
      tools: envApp(), colors: envApp(), reserves: envApp(), worker: null,
      qualification: { ELSATIA_PREVIEW_DB_URL: dbUrl, VERCEL_TOKEN: VERCEL, ELSATIA_QA_PASSWORD_A: MDP_A, ELSATIA_QA_PASSWORD_B: MDP_B, SUPABASE_ACCESS_TOKEN: faux("sbp", "t".repeat(30)) },
    },
    cible: target,
    noteCible: null,
  };
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });

/**
 * Faux runtime : Supabase (Auth + Storage en mémoire), Vercel, Stripe, Brevo, commandes locales et distantes.
 * `ledgerDistant` : versions présentes dans supabase_migrations.schema_migrations.
 */
function fauxRuntime({ ledgerDistant, dir, deploiementProd = false, secretsVus = [] }) {
  const appels = { distant: [], fetch: [], local: [] };
  let ledger = [...ledgerDistant];
  const objets = new Map();
  const sessions = new Map([[`jeton-a`, "A"], [`jeton-b`, "B"], [`jeton-a2`, "A"], [`jeton-b2`, "B"]]);
  const revoques = new Set();
  const lienCli = join(dir, "project-ref");
  const surveiller = (texte) => { for (const s of secretsVus) if (String(texte).includes(s)) throw new Error(`secret envoyé hors de sa destination : ${s.slice(0, 6)}…`); };

  const local = (cmd, args, { env = {} } = {}) => {
    appels.local.push([cmd, ...args].join(" "));
    const a = args.join(" ");
    if (cmd === "git") {
      if (a === "rev-parse HEAD") return { code: 0, stdout: `${HEAD}\n`, stderr: "" };
      if (a.startsWith("rev-parse --abbrev-ref")) return { code: 0, stdout: "claude/test\n", stderr: "" };
      if (a.startsWith("status")) return { code: 0, stdout: "", stderr: "" };
      if (a.startsWith("log")) return { code: 0, stdout: "", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    }
    if (a.includes("train-expectations.mjs")) return { code: 0, stdout: "train : 355 migrations, dernière 20260928000301 ; DB verify : 26 contrôles\nOK : attendus à jour\n", stderr: "" };
    if (a.includes("verify-migrations.mjs") || a.includes("env-check.mjs") || a.includes("smoke-email-preview.mjs")) return { code: 0, stdout: "GO\n", stderr: "" };
    if (cmd === "pg_dump" && a === "--version") return { code: 0, stdout: "pg_dump (PostgreSQL) 17.2\n", stderr: "" };
    if (cmd === "pg_restore" && args[0] === "--list") {
      const toc = ["1; 0 0 TABLE DATA supabase_migrations schema_migrations postgres", "2; 0 0 TABLE DATA public entreprises postgres", "3; 0 0 TABLE DATA auth users postgres", "4; 0 0 TABLE DATA storage objects postgres", ...Array.from({ length: 20 }, (_, i) => `${i + 5}; 0 0 TABLE public t${i} postgres`)];
      return { code: 0, stdout: toc.join("\n"), stderr: "" };
    }
    if (["psql", "pg_dump", "pg_restore", "npx"].includes(cmd)) return { code: 0, stdout: `${cmd} 17.2\n`, stderr: "" };
    surveiller(JSON.stringify(env));
    return { code: 0, stdout: "", stderr: "" };
  };

  const rt = {
    horsLigne: false,
    masque: null,
    set etape(_) { /* ignoré */ },
    journal() {},
    local,
    distant(cmd, args, options = {}) {
      const a = args.join(" ");
      appels.distant.push([cmd, ...args].join(" "));
      if (cmd === "git") return { code: 0, stdout: "", stderr: "" };
      if (cmd === "psql") {
        if (a.includes("server_version_num")) return { code: 0, stdout: "170004|postgres|on\n", stderr: "" };
        if (a.includes("schema_migrations")) return { code: 0, stdout: ledger.join("\n"), stderr: "" };
      }
      if (cmd === "pg_dump") { const f = args[args.indexOf("--file") + 1]; writeFileSync(f, Buffer.alloc(4096, 1)); return { code: 0, stdout: "", stderr: "" }; }
      if (cmd === "npx" && args.includes("link")) { writeFileSync(lienCli, args[args.indexOf("--project-ref") + 1]); return { code: 0, stdout: "", stderr: "" }; }
      if (cmd === "npx" && args.includes("push") && args.includes("--dry-run")) {
        const locales = versionsLocales(resolve(ROOT, "supabase/migrations"));
        const attente = locales.filter((v) => !ledger.includes(v));
        return { code: 0, stdout: `Would push these migrations:\n${attente.map((v) => ` • ${v}_x.sql`).join("\n")}\n`, stderr: "" };
      }
      if (cmd === "npx" && args.includes("push")) { ledger = versionsLocales(resolve(ROOT, "supabase/migrations")); return { code: 0, stdout: "Finished supabase db push.\n", stderr: "" }; }
      if (cmd === "npx" && args.includes("playwright")) {
        writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify({ stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0 }, suites: [] }));
        return { code: 0, stdout: "", stderr: "" };
      }
      if (cmd === process.execPath) { surveiller(a); return { code: 0, stdout: "GO : conforme.\n", stderr: "" }; }
      throw new Error(`commande distante non prévue : ${cmd} ${a}`);
    },
    async fetch(url, init = {}) {
      const u = new URL(url);
      const auth = init.headers?.Authorization ?? init.headers?.authorization ?? "";
      appels.fetch.push(`${init.method ?? "GET"} ${u.host}${u.pathname}`);
      // Clé Stripe live : ne doit JAMAIS partir sur le réseau.
      if (String(auth).includes(CLE_LIVE)) throw new Error("clé Stripe LIVE envoyée sur le réseau");
      if (u.host === "api.vercel.com") {
        if (u.pathname === "/v2/user") return auth ? json({ user: { username: "op" } }) : json({}, 403);
        if (u.pathname.startsWith("/v9/projects/")) { const id = decodeURIComponent(u.pathname.split("/")[3]); const app = APPS.find((a, i) => `prj_${a}${i}` === id); return json({ id, name: `elsatia-${app}-preview` }); }
        if (u.pathname.startsWith("/v13/deployments/")) { const hote = decodeURIComponent(u.pathname.split("/")[3]); const i = APPS.findIndex((a) => hote.includes(`-${a}-`)); return json({ id: `dpl_${i}`, projectId: `prj_${APPS[i]}${i}`, target: deploiementProd && i === 0 ? "production" : null, readyState: "READY", meta: { githubCommitSha: TRAIN.qualified_commit } }); }
        if (/^\/v10\/projects\/[^/]+\/env$/.test(u.pathname)) {
          const id = decodeURIComponent(u.pathname.split("/")[3]);
          const app = APPS.find((a, i) => `prj_${a}${i}` === id);
          const valeurs = app === "gp" ? envApp({ STRIPE_SECRET_KEY: CLE_TEST, BREVO_API_KEY: BREVO, EMAIL_FROM_ADDRESS: "noreply@exemple.fr" }) : envApp();
          return json({ envs: [...Object.entries(valeurs).map(([key, value]) => ({ key, value, target: ["preview"], type: "encrypted" })), { key: "SECRET_PROD", value: "x", target: ["production"] }] });
        }
        if (u.pathname.includes("runtime-logs")) return new Response(`${JSON.stringify({ level: "info", responseStatusCode: 200, requestPath: "/", timestampInMs: MAINTENANT })}\n`);
      }
      if (u.host === "api.stripe.com") {
        if (u.pathname === "/v1/account") return auth ? json({ id: "acct_TEST123" }) : json({}, 401);
        if (u.pathname === "/v1/events") return json({ data: [] });
      }
      if (u.host === "api.brevo.com") {
        if (u.pathname === "/v3/account") return init.headers?.["api-key"] ? json({ email: "recette@exemple.fr" }) : json({}, 401);
        if (u.pathname === "/v3/smtp/email") { const to = JSON.parse(init.body).to[0].email; if (to !== "qa-a@exemple.fr") throw new Error("e-mail hors allowlist envoyé"); return json({ messageId: "<m>" }, 201); }
      }
      if (u.host === "api.supabase.com") {
        if (u.pathname === `/v1/projects/${REF}`) return json({ name: "elsatia-preview", region: "eu-west-3", status: "ACTIVE_HEALTHY" });
        if (u.pathname.includes("/analytics/")) return json({ result: [] });
      }
      if (u.host === `${REF}.supabase.co`) {
        const p = u.pathname;
        const jeton = String(auth).replace(/^Bearer /, "");
        const qui = sessions.get(jeton);
        if (p === "/auth/v1/health") return json({}, 401);
        if (p === "/auth/v1/user") return qui && !revoques.has(jeton) ? json({ email: qui === "A" ? "qa-a@exemple.fr" : "qa-b@exemple.fr" }) : json({}, 401);
        if (p === "/auth/v1/token") {
          const corps = JSON.parse(init.body);
          if (u.searchParams.get("grant_type") === "password") {
            const ok = (corps.email === "qa-a@exemple.fr" && corps.password === MDP_A) || (corps.email === "qa-b@exemple.fr" && corps.password === MDP_B);
            if (!ok) return json({ error: "invalid_grant" }, 400);
            const l = corps.email === "qa-a@exemple.fr" ? "a" : "b";
            return json({ access_token: `jeton-${l}`, refresh_token: `rafraichir-${l}-1` });
          }
          if (revoques.has(corps.refresh_token)) return json({ error: "revoked" }, 400);
          const l = corps.refresh_token.includes("-a-") ? "a" : "b";
          return json({ access_token: `jeton-${l}2`, refresh_token: `rafraichir-${l}-2` });
        }
        if (p === "/auth/v1/logout") { const l = sessions.get(jeton) === "A" ? "a" : "b"; revoques.add(`rafraichir-${l}-2`); return new Response(null, { status: 204 }); }
        if (p === "/auth/v1/recover") return json({});
        const m = /^\/storage\/v1\/object\/(authenticated\/|sign\/|public\/)?([^/]+)\/?(.*)$/.exec(p);
        if (m) {
          const [, genre, , chemin] = m;
          const service = jeton === SERVICE;
          const dossierDe = (c) => (c.startsWith(ENT_A) ? "A" : "B");
          if (init.method === "DELETE") { const corps = JSON.parse(init.body); for (const c of corps.prefixes) if (service || dossierDe(c) === qui) objets.delete(c); return json([]); }
          if (!genre && init.method === "POST") { if (dossierDe(chemin) !== qui) return json({}, 403); objets.set(chemin, PNG); return json({ Key: chemin }); }
          if (genre === "public/") return json({}, 400);
          if (genre === "authenticated/") return objets.has(chemin) && dossierDe(chemin) === qui ? new Response(PNG) : json({}, 400);
          if (genre === "sign/" && init.method === "POST") return objets.has(chemin) && dossierDe(chemin) === qui ? json({ signedURL: `/object/sign/pointage-preuves/${chemin}?token=t` }) : json({}, 400);
          if (genre === "sign/") return new Response(PNG);
        }
      }
      if (u.host.endsWith(".vercel.app")) return new Response("", { status: 200 });
      throw new Error(`requête non prévue : ${init.method ?? "GET"} ${u.host}${u.pathname}`);
    },
    async dns() { return [{ address: "192.0.2.1" }]; },
    async tcp() { return true; },
  };
  return { rt, appels, lienCli };
}

async function scenario({ opts = [], ent = entrees(), ledgerDistant, deploiementProd = false, dir = mkdtempSync(join(tmpdir(), "qualif-")) } = {}) {
  const options = lireOptionsQualification(["--env-dir", dir, "--confirm-preview", REF, "--artifacts-dir", join(dir, "art"), "--backup-dir", join(dir, "backups"), "--backup-min-entries", "5", ...opts]);
  const secretsVus = [CLE_LIVE];
  const { rt, appels, lienCli } = fauxRuntime({ ledgerDistant, dir, deploiementProd, secretsVus });
  rt.masque = construireMasque(ent.envs, {});
  const res = await qualifier(options, { runtime: rt, entrees: ent, maintenant: MAINTENANT, log: () => {}, env: {}, cheminLienCli: lienCli });
  const brut = readFileSync(join(dir, "art", "preview-qualification.json"), "utf8");
  const par = Object.fromEntries(res.faits.map((f) => [f.id, f]));
  return { ...res, appels, brut, par };
}

const TOUTES = versionsLocales(resolve(ROOT, "supabase/migrations"));
const SECRETS = [CLE_TEST, CLE_LIVE, SERVICE, PUBLIQUE, MDP_DB, BREVO, VERCEL, MDP_A, MDP_B, "jeton-a2", "rafraichir-a-2"];

// ── Statuts, masque, verdict ───────────────────────────────────────────────
test("statuts : exactement les cinq de la mission", () => {
  assert.deepEqual(core.STATUTS, ["GO", "NO-GO", "SKIPPED", "BLOCKED_CREDENTIAL", "BLOCKED_NETWORK"]);
});

test("masque : valeurs enregistrées, mot de passe d'URL et motifs génériques", () => {
  const m = new core.Masque().ajouter(`postgresql://postgres:${MDP_DB}@db.${REF}.supabase.co:5432/postgres`).ajouter(VERCEL);
  const t = m.appliquer(`psql: FATAL password ${MDP_DB} ; jeton ${VERCEL} ; ${CLE_LIVE} ; Bearer ${SERVICE} ; redis://u:p@h:6379`);
  for (const s of [MDP_DB, VERCEL, CLE_LIVE, SERVICE, "u:p@h"]) assert.ok(!t.includes(s), s);
  assert.deepEqual(m.appliquerJson({ a: [`x ${VERCEL}`], n: 3 }), { a: ["x <secret-masqué>"], n: 3 });
  assert.equal(core.masquerEmail("julien@exemple.fr"), "j***@exemple.fr");
});

test("masque : noms secrets détectés, noms publics d'URL conservés", () => {
  for (const n of ["SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "ELSATIA_PREVIEW_DB_URL", "VERCEL_TOKEN", "BREVO_API_KEY", "STUDIO_REDIS_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) assert.ok(core.nomSecret(n), n);
  for (const n of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL", "EMAIL_FROM_ADDRESS"]) assert.ok(!core.nomSecret(n), n);
});

test("statut depuis la sortie d'un script du pack", () => {
  assert.equal(core.statutDepuisSortie(0, ""), "GO");
  assert.equal(core.statutDepuisSortie(2, "REFUS : ELSATIA_PREVIEW_DB_URL absente"), "BLOCKED_CREDENTIAL");
  assert.equal(core.statutDepuisSortie(2, "REFUS : référence Supabase PRODUCTION : refus"), "NO-GO");
  assert.equal(core.statutDepuisSortie(2, "REFUS : STRIPE_SECRET_KEY est une clé LIVE : refus"), "NO-GO");
  assert.equal(core.statutDepuisSortie(1, "✖ [HTTP-TRANSPORT] getaddrinfo ENOTFOUND x"), "BLOCKED_NETWORK");
  assert.equal(core.statutDepuisSortie(1, "✖ [DB-VERIFY] rls"), "NO-GO");
});

test("verdict : NO-GO > BLOCKED > INCOMPLETE > QUALIFIED ; plan hors ligne", () => {
  const e = (statut, requise = true) => ({ statut, requise });
  assert.equal(core.verdict([e("GO"), e("NO-GO", false)]), core.VERDICT.NO_GO);
  assert.equal(core.verdict([e("GO"), e("BLOCKED_NETWORK")]), core.VERDICT.BLOCKED);
  assert.equal(core.verdict([e("GO"), e("BLOCKED_NETWORK", false)]), core.VERDICT.QUALIFIED);
  assert.equal(core.verdict([e("GO"), e("SKIPPED")]), core.VERDICT.INCOMPLETE);
  assert.equal(core.verdict([e("GO")], { horsLigne: true }), core.VERDICT.PLAN);
  assert.equal(codeSortie(core.VERDICT.NO_GO), 1);
  assert.equal(codeSortie(core.VERDICT.BLOCKED), 3);
});

test("arrêt de sécurité : critique non GO bloque les écritures ; SKIPPED seulement si bloqueSiSaute", () => {
  assert.deepEqual(core.bloqueursEcriture([{ id: "a", critique: true, statut: "GO" }, { id: "b", critique: false, statut: "NO-GO" }]), []);
  assert.deepEqual(core.bloqueursEcriture([{ id: "a", critique: true, statut: "BLOCKED_CREDENTIAL" }]), ["a"]);
  assert.deepEqual(core.bloqueursEcriture([{ id: "a", critique: true, statut: "SKIPPED" }]), []);
  assert.deepEqual(core.bloqueursEcriture([{ id: "p", critique: true, statut: "SKIPPED", bloqueSiSaute: true }]), ["p"]);
});

// ── Cible et protection Production ─────────────────────────────────────────
test("cible : un fichier valide passe", () => {
  assert.deepEqual(cible.validerCible(cibleValide(), { maintenant: MAINTENANT }).erreurs, []);
});

test("cible : le gabarit versionné ne passe JAMAIS sans être rempli", () => {
  const ex = JSON.parse(readFileSync(resolve(ROOT, "docs/qualification/preview-pack/preview-target.example.json"), "utf8"));
  assert.ok(cible.validerCible(ex, { maintenant: MAINTENANT }).erreurs.length >= 5);
});

test("cible : Production Supabase, domaine de Production, sk_live et confirmations absentes sont refusés", () => {
  const cas = [
    [(c) => { c.supabase.project_ref = REF_PRODUCTION_CONNUE; c.confirmations.supabase_project_ref = REF_PRODUCTION_CONNUE; }, /PRODUCTION/],
    [(c) => { c.vercel.projects.gp.preview_origin = "https://app.elsatia.fr"; }, /Production/],
    [(c) => { c.vercel.allowed_custom_preview_domains = ["app.elsatia.fr"]; c.vercel.projects.gp.preview_origin = "https://app.elsatia.fr"; }, /Production/],
    [(c) => { c.vercel.projects.gp.preview_origin = "https://preview.elsatia.fr"; }, /Production|non listé/],
    [(c) => { c.stripe.mode = "live"; }, /stripe\.mode/],
    [(c) => { c.confirmations.stripe_mode = "sk_live"; }, /sk_test/],
    [(c) => { c.confirmations.supabase_project_ref = "x"; }, /recopie/],
    [(c) => { c.confirmations.vercel_preview_projects.pop(); }, /recopie/],
    [(c) => { c.confirmations.confirmed_at = "2026-09-01T00:00:00Z"; }, /7 jours/],
    [(c) => { c.brevo.recipient_allowlist = []; }, /allowlist/],
    [(c) => { c.qa.tenant_b.entreprise_id = ENT_A; }, /deux entreprises/],
  ];
  for (const [modifier, attendu] of cas) {
    const c = cibleValide();
    modifier(c);
    const { erreurs } = cible.validerCible(c, { maintenant: MAINTENANT });
    assert.ok(erreurs.some((e) => attendu.test(e)), `${attendu} ∉ ${erreurs.join(" | ")}`);
  }
});

test("cible : un domaine personnalisé Preview explicitement listé est admis", () => {
  const c = cibleValide();
  c.vercel.allowed_custom_preview_domains = ["preview.elsatia.fr"];
  c.vercel.projects.gp.preview_origin = "https://preview.elsatia.fr";
  assert.deepEqual(cible.validerCible(c, { maintenant: MAINTENANT }).erreurs, []);
  assert.ok(cible.estHoteProduction("app.elsatia.fr", ["app.elsatia.fr"]));
});

test("recoupement : clé live, déploiement Production, autre projet, autre compte", () => {
  const c = cibleValide();
  const { erreurs } = cible.recouperIdentites(c, {
    supabaseRefs: { "gp.env": REF_PRODUCTION_CONNUE, db: "b".repeat(20) },
    vercel: { gp: { projectId: "prj_autre", target: "production" } },
    stripe: { typesCles: { "gp.STRIPE_SECRET_KEY": "live" }, accountId: "acct_AUTRE" },
    redisHost: "prod.upstash.io", brevoEmail: "autre@exemple.fr", envProduction: ["tools.env"],
  });
  for (const re of [/PRODUCTION/, /≠ cible/, /déploiement PRODUCTION/, /autre projet/, /LIVE/, /stripe\.account_id/, /tools\.env/, /Brevo/]) assert.ok(erreurs.some((e) => re.test(e)), re.source);
  assert.ok(cible.destinataireAutorise(c, "QA-A@exemple.fr"));
  assert.ok(!cible.destinataireAutorise(c, "client@exemple.fr"));
});

// ── Ledger, dry-run, sauvegarde ────────────────────────────────────────────
test("ledger : les cinq classes", () => {
  const L = ["20260101000001", "20260101000002", "20260101000003"];
  assert.equal(db.classerLedger(L, L).classe, "ALIGNED");
  assert.equal(db.classerLedger(L, []).classe, "EMPTY");
  const p = db.classerLedger(L, L.slice(0, 1));
  assert.equal(p.classe, "PENDING_COMPATIBLE");
  assert.deepEqual(p.enAttente, L.slice(1));
  assert.equal(db.classerLedger(L, [L[0], L[2]]).classe, "PENDING_OUT_OF_ORDER");
  const f = db.classerLedger(L, [...L, "20260922000184"]);
  assert.equal(f.classe, "FOREIGN");
  assert.equal(f.compatible, false);
});

test("dry-run : doit annoncer exactement les migrations en attente, dans l'ordre", () => {
  const s = "Would push these migrations:\n • 20260928000101_a.sql\n • 20260928000201_b.sql\n";
  assert.ok(db.dryRunConforme(s, ["20260928000101", "20260928000201"]).ok);
  assert.ok(!db.dryRunConforme(s, ["20260928000101"]).ok);
  assert.ok(!db.dryRunConforme(s, ["20260928000201", "20260928000101"]).ok);
  assert.ok(db.dryRunConforme("Remote database is up to date.", []).ok);
});

test("sauvegarde : TOC exigée, version pg, URL jamais en argument, répertoire hors dépôt", () => {
  const toc = ["1; 0 0 TABLE DATA supabase_migrations schema_migrations postgres", "2; 0 0 TABLE DATA public entreprises postgres", "3; 0 0 TABLE DATA auth users x", "4; 0 0 TABLE DATA storage objects x"].join("\n");
  assert.ok(db.validerToc(toc, { minimumEntrees: 4 }).ok);
  assert.ok(!db.validerToc(toc.split("\n").slice(1).join("\n"), { minimumEntrees: 1 }).ok);
  assert.ok(!db.validerToc(toc, { minimumEntrees: 500 }).ok);
  assert.equal(db.majeurePg("pg_dump (PostgreSQL) 17.2"), 17);
  assert.equal(db.majeurePg("170004"), 17);
  const args = db.argumentsPgDump("/tmp/x.dump").join(" ");
  assert.ok(!/postgres(ql)?:\/\//.test(args) && args.includes("--schema supabase_migrations"));
  const pg = db.envPgDepuisUrl(`postgresql://postgres.${REF}:${encodeURIComponent("p@ss")}@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`);
  assert.equal(pg.PGPASSWORD, "p@ss");
  assert.equal(pg.PGSSLMODE, "require");
  assert.ok(!db.commandeRestauration("/b/x.dump").includes(MDP_DB) && db.commandeRestauration("/b/x.dump").includes("$ELSATIA_PREVIEW_DB_URL"));
  assert.equal(repertoireSauvegardeAutorise(ROOT, join(ROOT, "backups")), false);
  assert.equal(repertoireSauvegardeAutorise(ROOT, ROOT), false);
  assert.equal(repertoireSauvegardeAutorise(ROOT, join(tmpdir(), "b")), true);
});

test("logs et Playwright : analyses pures", () => {
  const nd = [{ level: "error", responseStatusCode: 500, requestPath: "/api/x", timestampInMs: 10 }, { level: "info", responseStatusCode: 200, timestampInMs: 10 }, { level: "error", timestampInMs: 1 }].map((x) => JSON.stringify(x)).join("\n");
  const a = analyserLogsVercel(nd, 5);
  assert.equal(a.total, 2);
  assert.equal(a.cinqCents, 1);
  assert.deepEqual(statsPlaywright({ stats: { expected: 2, unexpected: 1 } }), { attendus: 2, inattendus: 1, instables: 0, sautes: 0 });
  assert.deepEqual(echecsPlaywright({ suites: [{ title: "f", specs: [{ title: "t", tests: [{ status: "unexpected" }] }] }] }), ["f › t"]);
});

test("ordre : protection avant ledger, sauvegarde avant dry-run et push, toutes les sections couvertes", () => {
  const ids = toutesEtapes().map((e) => e.id);
  const i = (id) => ids.indexOf(id);
  assert.ok(i("protection.target") < i("ledger.read") && i("backup.validate") < i("db.push-dry-run") && i("db.push-dry-run") < i("db.push") && i("db.push") < i("db.verify"));
  const sections = new Set(toutesEtapes().map((e) => e.section));
  for (let s = 3; s <= 16; s += 1) assert.ok(sections.has(s), `section ${s}`);
  assert.equal(toutesEtapes().filter((e) => e.nature === "dangerous-write").map((e) => e.id).join(), "db.push");
});

// ── Scénarios de bout en bout (faux runtime) ───────────────────────────────
test("plan hors ligne : aucun appel distant, verdict PLAN, aucun secret dans le JSON", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qualif-off-"));
  const options = lireOptionsQualification(["--offline", "--mode", "full", "--env-dir", dir, "--artifacts-dir", join(dir, "art"), "--confirm-preview", REF]);
  const ent = entrees();
  const interdit = () => { throw new Error("appel distant en mode --offline"); };
  const { creerRuntime } = await import("./lib/runtime.mjs");
  const masque = construireMasque(ent.envs, {});
  const rt = creerRuntime({ horsLigne: true, journalDir: null, masque, fetchImpl: interdit, dnsImpl: { lookup: interdit }, netImpl: { connect: interdit } });
  const vraiLocal = rt.local.bind(rt);
  rt.local = (cmd, args, o) => (cmd === "git" && args[0] === "ls-remote" ? interdit() : vraiLocal(cmd, args, o));
  const res = await qualifier(options, { runtime: rt, entrees: ent, maintenant: MAINTENANT, log: () => {}, env: {} });
  assert.equal(res.verdict, core.VERDICT.PLAN);
  const brut = readFileSync(join(dir, "art", "preview-qualification.json"), "utf8");
  for (const s of SECRETS) assert.ok(!brut.includes(s), `secret dans le JSON : ${s.slice(0, 6)}`);
  const par = Object.fromEntries(res.faits.map((f) => [f.id, f.statut]));
  assert.equal(par["ledger.read"], "BLOCKED_NETWORK");
  assert.equal(par["db.push"], "SKIPPED");
});

test("parcours complet simulé : sauvegarde → dry-run → push → verify → services → QUALIFIED", async () => {
  const r = await scenario({ opts: ["--mode", "full", "--apply-migrations"], ledgerDistant: TOUTES.slice(0, -3) });
  const nonGo = r.faits.filter((f) => !["GO", "SKIPPED"].includes(f.statut)).map((f) => `${f.id}=${f.statut}:${f.resume}`);
  assert.deepEqual(nonGo, []);
  assert.equal(r.par["db.push"].statut, "GO");
  assert.equal(r.verdict, core.VERDICT.QUALIFIED, r.faits.filter((f) => f.requise && f.statut !== "GO").map((f) => f.id).join());
  const idx = (motif) => r.appels.distant.findIndex((a) => motif.test(a));
  assert.ok(idx(/^pg_dump /) < idx(/push --linked --dry-run/) && idx(/push --linked --dry-run/) < idx(/db push --linked$/));
  for (const s of SECRETS) assert.ok(!r.brut.includes(s), `secret dans le JSON : ${s.slice(0, 6)}`);
  assert.ok(r.json.backup.sha256 && r.json.backup.restore_command.includes("pg_restore"));
  assert.equal(r.json.ledger.class, "ALIGNED");
  assert.ok(r.json.manual_confirmations.length >= 2);
});

test("sans --apply-migrations : aucune migration appliquée, verdict non qualifié", async () => {
  const r = await scenario({ opts: ["--mode", "full"], ledgerDistant: TOUTES.slice(0, -3) });
  assert.equal(r.par["db.push"].statut, "SKIPPED");
  assert.ok(!r.appels.distant.some((a) => /db push --linked$/.test(a)));
  assert.equal(r.par["db.verify"].statut, "NO-GO", "une Preview sans le train complet n'est jamais qualifiée");
  assert.notEqual(r.verdict, core.VERDICT.QUALIFIED);
});

test("sk_live : aucune requête Stripe, arrêt de sécurité des écritures, diagnostics poursuivis", async () => {
  const r = await scenario({ opts: ["--mode", "full", "--apply-migrations"], ent: entrees({ gp: { STRIPE_SECRET_KEY: CLE_LIVE } }), ledgerDistant: TOUTES.slice(0, -3) });
  assert.equal(r.par["preflight.stripe-mode"].statut, "NO-GO");
  assert.equal(r.par["protection.target"].statut, "NO-GO");
  for (const id of ["db.push", "auth.gotrue", "storage.cross-tenant", "e2e.gp"]) {
    assert.equal(r.par[id].statut, "SKIPPED", id);
    assert.ok(r.par[id].arret_securite, id);
  }
  assert.ok(!r.appels.distant.some((a) => /db push --linked$/.test(a)));
  // Seule la sonde de joignabilité SANS identifiant touche Stripe ; le faux runtime lève si la clé live part.
  assert.deepEqual(r.appels.fetch.filter((f) => f.includes("api.stripe.com")), ["GET api.stripe.com/v1/account"]);
  assert.equal(r.par["http.smoke"].statut, "GO", "le diagnostic HTTP en lecture continue");
  assert.equal(r.par["ledger.read"].statut, "GO", "le ledger reste lu");
  assert.equal(r.verdict, core.VERDICT.NO_GO);
  assert.ok(!r.brut.includes(CLE_LIVE));
});

test("URL DB de Production : identité Supabase NO-GO, aucune écriture", async () => {
  const r = await scenario({ opts: ["--mode", "full", "--apply-migrations"], ent: entrees({ dbUrl: `postgresql://postgres:${MDP_DB}@db.${REF_PRODUCTION_CONNUE}.supabase.co:5432/postgres` }), ledgerDistant: TOUTES.slice(0, -3) });
  assert.equal(r.par["preflight.supabase-identity"].statut, "NO-GO");
  assert.equal(r.par["db.push"].statut, "SKIPPED");
  assert.ok(!r.appels.distant.some((a) => /^(psql|pg_dump) |db push/.test(a)), "aucune connexion à la Production, même en lecture");
  assert.equal(r.par["ledger.read"].statut, "NO-GO");
  assert.ok(!r.brut.includes(MDP_DB));
});

test("déploiement Vercel de Production : NO-GO critique, écritures suspendues", async () => {
  const r = await scenario({ opts: ["--mode", "full"], ledgerDistant: TOUTES, deploiementProd: true });
  assert.equal(r.par["preflight.vercel-identity"].statut, "NO-GO");
  assert.equal(r.par["auth.gotrue"].statut, "SKIPPED");
});

test("ledger d'une autre lignée : NO-GO, pas de push, DB verify en lecture exécuté", async () => {
  const r = await scenario({ opts: ["--mode", "full", "--apply-migrations"], ledgerDistant: [...TOUTES.slice(0, -3), "20260922000184"] });
  assert.equal(r.par["ledger.read"].statut, "NO-GO");
  assert.equal(r.par["db.push"].statut, "SKIPPED");
  assert.ok(r.appels.distant.some((a) => a.includes("db-verify.mjs")), "le diagnostic DB en lecture est exécuté malgré le NO-GO");
  assert.ok(!r.appels.distant.some((a) => /db push --linked$/.test(a)));
});

test("mode read-only : aucune écriture, pas de sauvegarde, verdict INCOMPLETE au mieux", async () => {
  const r = await scenario({ opts: [], ledgerDistant: TOUTES });
  for (const id of ["backup.dump", "db.push", "auth.gotrue", "storage.cross-tenant", "e2e.gp"]) assert.equal(r.par[id].statut, "SKIPPED", id);
  assert.ok(!r.appels.distant.some((a) => /^pg_dump |db push|playwright/.test(a)));
  assert.ok(!r.appels.fetch.some((f) => f.includes("/auth/v1/token") || /^POST .*storage\/v1\/object/.test(f)));
  assert.equal(r.appels.fetch.filter((f) => f.includes("smtp/email")).length, 1, "bac à sable Brevo seulement");
  assert.equal(r.verdict, core.VERDICT.INCOMPLETE);
});

test("--pull-env : variables Preview de la branche du train, sensitive listées par nom, relisibles", () => {
  const { env, sensibles } = variablesPreview([
    { key: "A", value: "generique", target: ["preview"] },
    { key: "A", value: "branche", target: ["preview"], gitBranch: TRAIN.branch },
    { key: "B", value: "autre-branche", target: ["preview"], gitBranch: "feature/x" },
    { key: "C", value: "prod", target: ["production"] },
    { key: "D", target: ["preview"], type: "sensitive" },
    { key: "E", value: "l1\nl2 \"q\"", target: "preview" },
  ], TRAIN.branch);
  assert.deepEqual(env, { A: "branche", E: "l1\nl2 \"q\"" });
  assert.deepEqual(sensibles, ["D"]);
  const relu = parseEnvFile(ecrireDotenv({ K: "v=1", M: "a\nb" }));
  assert.equal(relu.K, "v=1");
  assert.equal(relu.M, "a\\nb");
});

test("--pull-env : les 4 fichiers sont écrits hors dépôt puis contrôlés, aucune valeur dans le JSON", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qualif-pull-"));
  const ent = entrees();
  for (const a of APPS) ent.envs[a] = null;
  const r = await scenario({ opts: ["--pull-env"], ent, ledgerDistant: TOUTES, dir });
  assert.equal(r.par["preflight.pull-env"].statut, "GO");
  assert.equal(r.par["preflight.env"].statut, "GO");
  assert.ok(readFileSync(join(dir, "gp.env"), "utf8").includes("STRIPE_SECRET_KEY="));
  for (const s of [CLE_TEST, SERVICE, BREVO]) assert.ok(!r.brut.includes(s));
});

test("--pull-env : refusé si --env-dir est dans le dépôt", async () => {
  const ent = entrees();
  const r = await scenario({ opts: ["--pull-env", "--env-dir", join(ROOT, "tmp-env")], ent, ledgerDistant: TOUTES });
  assert.equal(r.par["preflight.pull-env"].statut, "NO-GO");
});
