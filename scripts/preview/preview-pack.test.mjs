// Tests hors réseau du pack d'exécution Preview (scripts/preview/*).
// Lancer : node --test scripts/preview/preview-pack.test.mjs   (npm run test:preview-pack)
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import * as garde from "./lib/preview-guard.mjs";
import { inventaire, resume, classer } from "./env-inventory.mjs";
import { controlesCroises, executer as envCheck } from "./env-check.mjs";
import { comparerMigrations, analyserVerify, analyserPreflight, sqlSondeRls, versionsLocales, estBancLocal, evaluerServiceSeulement, RPC_SERVICE_SEULEMENT, sqlServiceSeulement } from "./db-verify.mjs";
import { attentes, evaluer as evaluerHttp, executer as httpSmoke } from "./http-smoke.mjs";
import { ENDPOINTS, evaluerEndpoints, evaluerPortail, evaluerPrix, executer as stripeVerify } from "./stripe-test-verify.mjs";
import { EXPECTED_BUCKETS, evaluerBuckets, executer as storageSmoke } from "./storage-smoke.mjs";
import { analyser, encoder, evaluer as evaluerRedis, lireInfo } from "./redis-check.mjs";
import { loadJson, MANIFEST_PATH } from "../lib/env-manifest-core.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const manifest = loadJson(ROOT, MANIFEST_PATH);
const REF = garde.REF_PREVIEW_AUTORISEE;
const PROD = garde.REF_PRODUCTION_CONNUE;
// Valeurs factices construites à l'exécution (le scanner de secrets ne doit rien voir ici).
const fauxStripe = (mode) => ["sk", mode, "x".repeat(24)].join("_");
const silence = () => {};

// ── Garde-fous ──────────────────────────────────────────────────────────────
test("garde : références Supabase (API, DB directe, pooler)", () => {
  assert.equal(garde.refDepuisUrlApi(`https://${REF}.supabase.co`), REF);
  assert.equal(garde.refDepuisUrlDb(`postgresql://postgres:p@db.${REF}.supabase.co:5432/postgres`), REF);
  assert.equal(garde.refDepuisUrlDb(`postgresql://postgres.${REF}:p@aws-0-eu-west-3.pooler.supabase.com:6543/postgres`), REF);
  assert.equal(garde.refDepuisUrlDb("postgresql://postgres:p@example.com/db"), null);
});

test("garde : la Production est toujours refusée, même si on la déclare attendue", () => {
  assert.throws(() => garde.exigerRefPreview(PROD), garde.Refus);
  assert.throws(() => garde.exigerRefPreview(PROD, PROD), /PRODUCTION/);
  assert.throws(() => garde.exigerRefPreview("a".repeat(20)), /Preview attendue/);
  assert.equal(garde.exigerRefPreview(REF), REF);
  assert.throws(() => garde.refuserProduction({ VERCEL_ENV: "production" }), garde.Refus);
  assert.throws(() => garde.refuserProduction({ ELSATIA_APPLICATION_ENV: "production" }), garde.Refus);
});

test("garde : clés Stripe — live refusée, test acceptée, rien n'est renvoyé", () => {
  assert.throws(() => garde.exigerCleStripeTest(fauxStripe("live")), /LIVE/);
  assert.doesNotThrow(() => garde.exigerCleStripeTest(fauxStripe("test")));
  assert.equal(garde.typeCleStripe(fauxStripe("test")), "test");
  assert.throws(() => garde.exigerCleStripeTest(""), /absente/);
});

test("garde : origines Preview (HTTPS, non locale, *.vercel.app sauf opt-in)", () => {
  assert.equal(garde.exigerOriginePreview("https://x-y.vercel.app/abc"), "https://x-y.vercel.app");
  assert.throws(() => garde.exigerOriginePreview("http://x.vercel.app"), /HTTPS/);
  assert.throws(() => garde.exigerOriginePreview("https://app.elsatia.fr"), /allow-custom-domain/);
  assert.equal(garde.exigerOriginePreview("https://preview.example.fr", { domainePersonnaliseAutorise: true }), "https://preview.example.fr");
});

// ── Inventaire ─────────────────────────────────────────────────────────────
test("inventaire : dérivé du manifeste, sans valeur, classes cohérentes", () => {
  const gp = inventaire(manifest, "gestion_pro");
  assert.ok(gp.length > 50);
  for (const l of gp) assert.ok(!("value" in l));
  const req = gp.filter((l) => l.classe === "REQUIRED").map((l) => l.name);
  for (const n of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_EXPECTED_MODE", "ELSATIA_APPLICATION_ENV"]) assert.ok(req.includes(n), n);
  assert.equal(gp.find((l) => l.name === "STRIPE_WEBHOOK_EXPECTED_MODE").imposee, "test");
  assert.equal(gp.find((l) => l.name === "FEATURE_CRONS_ENABLED").imposee, "false");
  assert.ok(gp.find((l) => l.name === "DISABLE_EMAIL_LOGIN").interdite);
  const colors = resume(inventaire(manifest, "colors"));
  assert.equal(colors.required, colors.total);
  assert.equal(classer({ required: false, required_when: "x" }), "CONDITIONAL");
});

// ── Contrôles croisés ──────────────────────────────────────────────────────
const url = `https://${REF}.supabase.co`;
const pub = "sb_publishable_" + "p".repeat(20);
const svc = "sb_secret_" + "s".repeat(24);
const envsSains = () => ({
  gp: { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pub, SUPABASE_SERVICE_ROLE_KEY: svc, NEXT_PUBLIC_APP_URL: "https://gp.vercel.app", NEXT_PUBLIC_COLORS_URL: "https://colors.vercel.app", TOOLS_APP_URL: "https://tools.vercel.app", TOOLS_ALLOWED_ORIGINS: "https://tools.vercel.app,capacitor://localhost", STRIPE_SECRET_KEY: fauxStripe("test"), TOOLS_STORE_ENVIRONMENT: "sandbox" },
  colors: { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pub, SUPABASE_SERVICE_ROLE_KEY: svc, NEXT_PUBLIC_COLORS_URL: "https://colors.vercel.app/", NEXT_PUBLIC_ELSATIA_ACCOUNT_URL: "https://gp.vercel.app/abonnement" },
  tools: { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pub, NEXT_PUBLIC_TOOLS_URL: "https://tools.vercel.app", NEXT_PUBLIC_TOOLS_BILLING_API_URL: "https://gp.vercel.app" },
  reserves: { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: pub, SUPABASE_SERVICE_ROLE_KEY: svc },
});
const erreurs = (c) => c.filter((x) => x.niveau === "error").map((x) => x.code);

test("croisés : une Preview cohérente ne produit aucune erreur", () => {
  assert.deepEqual(erreurs(controlesCroises(envsSains(), { manifest })), []);
});

test("croisés : chaque incohérence est détectée sans exposer de valeur", () => {
  const cas = [
    [(e) => { e.colors.NEXT_PUBLIC_SUPABASE_URL = `https://${"b".repeat(20)}.supabase.co`; }, "X-SUPABASE-SSO"],
    [(e) => { e.gp.NEXT_PUBLIC_SUPABASE_URL = `https://${PROD}.supabase.co`; }, "X-SUPABASE-PRODUCTION"],
    [(e) => { e.reserves.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_" + "q".repeat(20); }, "X-PUBLIC-KEY"],
    [(e) => { e.colors.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_" + "t".repeat(24); }, "X-SERVICE-KEY"],
    [(e) => { e.colors.NEXT_PUBLIC_ELSATIA_ACCOUNT_URL = "https://autre.vercel.app/abonnement"; }, "X-URL-ACCOUNT"],
    [(e) => { e.tools.NEXT_PUBLIC_TOOLS_BILLING_API_URL = "https://autre.vercel.app"; }, "X-URL-TOOLS-BILLING"],
    [(e) => { e.gp.TOOLS_ALLOWED_ORIGINS = "capacitor://localhost"; }, "X-TOOLS-CORS"],
    [(e) => { e.gp.NEXT_PUBLIC_COLORS_URL = "https://ancien.vercel.app"; }, "X-URL-COLORS"],
    [(e) => { e.tools.NEXT_PUBLIC_TOOLS_RUNTIME = svc; }, "X-SECRET-IN-PUBLIC"],
    [(e) => { e.gp.STRIPE_SECRET_KEY = fauxStripe("live"); }, "X-STRIPE-LIVE"],
  ];
  for (const [casser, code] of cas) {
    const envs = envsSains();
    casser(envs);
    const res = controlesCroises(envs, { manifest });
    assert.ok(erreurs(res).includes(code), code);
    const texte = JSON.stringify(res);
    for (const secret of [svc, pub, fauxStripe("live")]) assert.ok(!texte.includes(secret), `${code} expose une valeur`);
  }
});

test("env-check : fichiers réels, refus d'un fichier Production, NO-GO sur gabarits vides", () => {
  const dir = mkdtempSync(join(tmpdir(), "pp-env-"));
  writeFileSync(join(dir, "colors.env"), "NEXT_PUBLIC_SUPABASE_URL=\n");
  const lignes = [];
  assert.equal(envCheck({ dir, requis: ["gp"] }, (l) => lignes.push(l)), garde.SORTIE.NO_GO);
  assert.ok(lignes.some((l) => l.includes("X-FILE-MISSING")));
  writeFileSync(join(dir, "gp.env"), "ELSATIA_APPLICATION_ENV=production\n");
  assert.throws(() => envCheck({ dir }, silence), garde.Refus);
});

// ── Base ───────────────────────────────────────────────────────────────────
test("db : comparaison du registre des migrations", () => {
  const locales = versionsLocales();
  assert.equal(locales.length, 335);
  assert.equal(locales.at(-1), "20260923000400");
  const ok = comparerMigrations(locales, locales);
  assert.deepEqual([ok.nonAppliquees.length, ok.inconnuesDuDepot.length], [0, 0]);
  const autre = comparerMigrations(locales, [...locales.slice(0, 328), "20260922000184"]);
  assert.equal(autre.nonAppliquees.length, 7);
  assert.deepEqual(autre.inconnuesDuDepot, ["20260922000184"]);
});

test("db : analyse des sorties SQL (verify, preflight)", () => {
  const v = analyserVerify("1|migrations appliquées|335|335|t|t\n9|url_preview|0|5 sans|f|f\n3|RLS|0|1|f|t\n");
  assert.equal(v.length, 3);
  assert.deepEqual(v.map((x) => [x.ok, x.bloquant]), [[true, true], [false, false], [false, true]]);
  const p = analyserPreflight("NOTICE:  PREFLIGHT | cle_attestation_active_absente | anomalies=1 | bloquant=true | x\nNOTICE:  PREFLIGHT | autre | anomalies=0 | bloquant=false | y");
  assert.deepEqual(p, [{ controle: "cle_attestation_active_absente", anomalies: 1, bloquant: true }, { controle: "autre", anomalies: 0, bloquant: false }]);
});

test("db : sonde RLS — UUID strict (aucune injection), transaction en lecture seule", () => {
  assert.throws(() => sqlSondeRls("x'; drop table clients; --"), garde.Refus);
  const sql = sqlSondeRls("357c2373-2772-477d-a978-899503a02d6c");
  assert.match(sql, /^begin transaction read only;/);
  assert.match(sql, /set local role authenticated;/);
  assert.match(sql, /rollback;$/);
  assert.equal(estBancLocal("postgresql://u:p@127.0.0.1:5432/x"), true);
  assert.equal(estBancLocal(`postgresql://u:p@db.${REF}.supabase.co:5432/postgres`), false);
});

test("db : RPC service-role only — accord à authenticated, absence, service_role manquant", () => {
  assert.equal(RPC_SERVICE_SEULEMENT.length, 20);
  assert.match(sqlServiceSeulement(), /unnest\(array\['reserver_evenement_abonnement_service'/);
  const r = evaluerServiceSeulement("a|f|f|t|1\nb|f|t|t|1\nc|f|f|f|0\nd|f|f|f|1\n");
  assert.deepEqual(r.map((x) => x.ok), [true, false, false, false]);
  assert.match(r[1].message, /authenticated/);
  assert.match(r[2].message, /absente/);
  assert.match(r[3].message, /service_role/);
});

// ── HTTP ───────────────────────────────────────────────────────────────────
test("http : une page protégée servie en 200 est une fuite ; 5xx toujours en échec", () => {
  const protege = { path: "/dashboard", status: [307], location: /\/login/, protege: true };
  assert.equal(evaluerHttp(protege, { status: 200, corps: "<html>tableau</html>" }).code, "HTTP-PROTECTED-OPEN");
  assert.equal(evaluerHttp(protege, { status: 307, location: "/login" }).ok, true);
  assert.equal(evaluerHttp(protege, { status: 307, location: "/ailleurs" }).code, "HTTP-LOCATION");
  assert.equal(evaluerHttp({ path: "/", status: [200] }, { status: 503 }).code, "HTTP-5XX");
  assert.equal(evaluerHttp({ path: "/api", status: [200], json: true }, { status: 200, corps: "<html>" }).code, "HTTP-JSON");
  assert.equal(evaluerHttp({ path: "/", status: [200] }, { status: 401, vercelProtection: true }).code, "HTTP-VERCEL-PROTECTION");
});

test("http : 503 du rate-limiter et catalogue Tools non configuré distingués", () => {
  const cat = attentes().gp.find((a) => a.catalogueTools);
  assert.equal(evaluerHttp(cat, { status: 503, corps: JSON.stringify({ products: [], error: "Catalogue indisponible" }) }).ok, true);
  assert.equal(evaluerHttp(cat, { status: 503, corps: "<html>erreur</html>" }).code, "HTTP-5XX");
  assert.equal(evaluerHttp(cat, { status: 307, location: "/login" }).code, "HTTP-STATUS");
  const strict = attentes({ toolsBilling: true }).gp.find((a) => a.path === "/api/tools/monetization/catalog" && !a.method);
  assert.equal(evaluerHttp(strict, { status: 503, corps: JSON.stringify({ products: [] }) }).ok, false);
  const cb = attentes().gp.find((a) => a.path === "/auth/callback");
  assert.equal(evaluerHttp(cb, { status: 503, corps: JSON.stringify({ error: "Protection anti-abus indisponible." }) }).code, "HTTP-RATE-LIMIT-DOWN");
});

test("http : crons 404 en Preview (FEATURE_CRONS_ENABLED=false), 401 si activés", () => {
  const off = attentes().gp.find((a) => a.path === "/api/cron/abonnements");
  const on = attentes({ cronsActives: true }).gp.find((a) => a.path === "/api/cron/abonnements");
  assert.deepEqual([off.status, on.status], [[404], [401]]);
});

test("http : exécution avec un fetch simulé — GET/OPTIONS seulement, redirections non suivies", async () => {
  const methodes = new Set();
  const fetchImpl = async (u, init) => {
    methodes.add(init.method);
    assert.equal(init.redirect, "manual");
    const chemin = new URL(u).pathname;
    const a = attentes().reserves.find((x) => new URL(`https://h${x.path}`).pathname === chemin);
    const status = a.status[0];
    return new Response(status === 204 ? null : "ok", { status, headers: status === 307 ? { location: "/login" } : {} });
  };
  assert.equal(await httpSmoke({ reserves: "https://r.vercel.app" }, { fetchImpl, log: silence }), garde.SORTIE.GO);
  assert.deepEqual([...methodes], ["GET"]);
});

// ── Stripe ─────────────────────────────────────────────────────────────────
const gpOrigin = "https://gp.vercel.app";
const endpoint = (nom, extra = {}) => ({ url: `${gpOrigin}${ENDPOINTS[nom].route}?x-vercel-protection-bypass=zz`, status: "enabled", livemode: false, enabled_events: ENDPOINTS[nom].events, ...extra });

test("stripe : endpoints — conforme, manquant, désactivé, événements manquants/en trop, live", () => {
  assert.deepEqual(evaluerEndpoints([endpoint("abonnement")], { gpOrigin, scope: ["abonnement"] }).map((c) => c.niveau), ["ok"]);
  assert.equal(evaluerEndpoints([], { gpOrigin, scope: ["abonnement"] })[0].code, "STRIPE-ENDPOINT-MISSING");
  const codes = (e) => evaluerEndpoints([e], { gpOrigin, scope: ["abonnement"] }).map((c) => c.code);
  assert.ok(codes(endpoint("abonnement", { status: "disabled" })).includes("STRIPE-ENDPOINT-DISABLED"));
  assert.ok(codes(endpoint("abonnement", { livemode: true })).includes("STRIPE-ENDPOINT-LIVE"));
  assert.ok(codes(endpoint("abonnement", { enabled_events: ["invoice.paid"] })).includes("STRIPE-EVENTS-MISSING"));
  assert.ok(codes(endpoint("abonnement", { enabled_events: [...ENDPOINTS.abonnement.events, "customer.created"] })).includes("STRIPE-EVENTS-EXTRA"));
});

test("stripe : portail et prix", () => {
  const conf = { active: true, livemode: false, features: { subscription_update: { enabled: true, products: [{}] }, subscription_cancel: { enabled: true, mode: "at_period_end" }, invoice_history: { enabled: true }, payment_method_update: { enabled: true } } };
  assert.equal(evaluerPortail(conf)[0].niveau, "ok");
  assert.ok(evaluerPortail({ ...conf, features: { ...conf.features, subscription_cancel: { enabled: true, mode: "immediately" } } }).some((c) => c.code === "STRIPE-PORTAL-CANCEL-MODE"));
  assert.equal(evaluerPortail(null)[0].niveau, "error");
  assert.equal(evaluerPrix("STRIPE_PRICE_PRO_ANNUEL", { active: true, livemode: false, recurring: { interval: "year" } }).niveau, "ok");
  assert.equal(evaluerPrix("STRIPE_PRICE_PRO_ANNUEL", { active: true, livemode: false, recurring: { interval: "month" } }).code, "STRIPE-PRICE-INTERVAL");
  assert.equal(evaluerPrix("STRIPE_PRICE_PRO_MENSUEL", null).code, "STRIPE-PRICE-NOT-FOUND");
});

test("stripe : clé live refusée AVANT tout appel réseau ; exécution simulée en GET seulement", async () => {
  let appels = 0;
  const compteur = async () => { appels += 1; return new Response("{}"); };
  await assert.rejects(stripeVerify({ env: { STRIPE_SECRET_KEY: fauxStripe("live") }, gpOrigin, scope: ["abonnement"] }, { fetchImpl: compteur, log: silence }), garde.Refus);
  assert.equal(appels, 0);
  const env = { STRIPE_SECRET_KEY: fauxStripe("test"), STRIPE_WEBHOOK_ABONNEMENT_SECRET: "x" };
  for (const o of ["MINI", "PRO", "BUSINESS", "ENTREPRISE"]) for (const p of ["MENSUEL", "ANNUEL"]) env[`STRIPE_PRICE_${o}_${p}`] = `price_${o}_${p}`;
  const fetchImpl = async (u, init) => {
    assert.equal(init.method, "GET");
    const { pathname } = new URL(u);
    if (pathname === "/v1/webhook_endpoints") return Response.json({ data: [endpoint("abonnement")] });
    if (pathname === "/v1/billing_portal/configurations") return Response.json({ data: [{ active: true, livemode: false, features: { subscription_update: { enabled: true, products: [{}] }, subscription_cancel: { enabled: true, mode: "at_period_end" }, invoice_history: { enabled: true }, payment_method_update: { enabled: true } } }] });
    const id = pathname.split("/").at(-1);
    return Response.json({ active: true, livemode: false, recurring: { interval: id.endsWith("ANNUEL") ? "year" : "month" } });
  };
  assert.equal(await stripeVerify({ env, gpOrigin, scope: ["abonnement"] }, { fetchImpl, log: silence }), garde.SORTIE.GO);
});

// ── Storage ────────────────────────────────────────────────────────────────
test("storage : liste identique à scripts/preflight-preview.mjs", async () => {
  process.env.PREFLIGHT_PREVIEW_SKIP_MAIN = "1";
  const { EXPECTED_BUCKETS: attendus } = await import("../preflight-preview.mjs");
  assert.deepEqual(EXPECTED_BUCKETS, attendus);
});

test("storage : drapeau public exact, bucket manquant, limite absente", () => {
  const sains = EXPECTED_BUCKETS.map((id) => ({ id, public: id === "entreprise-assets", file_size_limit: 1 }));
  assert.ok(evaluerBuckets(sains).every((c) => c.ok));
  const publie = sains.map((b) => (b.id === "bulletins-paie" ? { ...b, public: true } : b));
  assert.ok(evaluerBuckets(publie).some((c) => c.code === "STORAGE-BUCKET-PUBLIC" && !c.ok));
  assert.ok(evaluerBuckets(sains.slice(1)).some((c) => c.code === "STORAGE-BUCKET-MISSING"));
});

test("storage : safe-run --write dépose, lit par URL signée, puis supprime (simulé)", async () => {
  const objets = new Map();
  const vus = [];
  const fetchImpl = async (u, init = {}) => {
    const { pathname } = new URL(u);
    vus.push(`${init.method ?? "GET"} ${pathname.replace(/\d{6,}/, "<ts>")}`);
    const service = init.headers?.apikey?.startsWith("sb_secret_");
    if (pathname === "/storage/v1/bucket") return Response.json(service ? EXPECTED_BUCKETS.map((id) => ({ id, public: id === "entreprise-assets", file_size_limit: 1 })) : []);
    if (pathname.startsWith("/storage/v1/object/public/")) return new Response("", { status: 400 });
    if (init.method === "POST" && pathname.startsWith("/storage/v1/object/sign/")) return Response.json({ signedURL: `${pathname.replace("/storage/v1", "")}?token=t` });
    if (init.method === "POST" && pathname.startsWith("/storage/v1/object/list/")) return Response.json([...objets.keys()].map((k) => ({ name: k.replace("preview-smoke/", "") })));
    if (init.method === "POST") { objets.set(pathname.split("pointage-preuves/")[1], init.body); return Response.json({ Key: "k" }); }
    if (init.method === "DELETE") { for (const p of JSON.parse(init.body).prefixes) objets.delete(p); return Response.json([]); }
    if (pathname.startsWith("/storage/v1/object/sign/")) return new Response(objets.get(pathname.split("pointage-preuves/")[1]));
    return new Response("", { status: 404 });
  };
  const env = { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: svc, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pub };
  assert.equal(await storageSmoke({ env, ecrire: true }, { fetchImpl, log: silence, maintenant: 1700000000000 }), garde.SORTIE.GO);
  assert.equal(objets.size, 0);
  assert.ok(vus.includes("DELETE /storage/v1/object/pointage-preuves"));
  await assert.rejects(storageSmoke({ env: { ...env, NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` } }, { fetchImpl, log: silence }), /PRODUCTION/);
});

// ── Redis ──────────────────────────────────────────────────────────────────
test("redis : codec RESP", () => {
  assert.equal(encoder(["PING"]), "*1\r\n$4\r\nPING\r\n");
  assert.deepEqual(analyser(Buffer.from("+PONG\r\n")), { valeur: "PONG", fin: 7 });
  assert.equal(analyser(Buffer.from("$5\r\nabc")), null);
  assert.deepEqual(analyser(Buffer.from("*2\r\n:1\r\n$2\r\nok\r\n")).valeur, [1, "ok"]);
  assert.ok(analyser(Buffer.from("-ERR non\r\n")).valeur instanceof Error);
  assert.equal(lireInfo("# Memory\r\nmaxmemory_policy:noeviction\r\n").maxmemory_policy, "noeviction");
});

test("redis : règles noeviction / version / TLS", () => {
  const base = { protocole: "rediss:", hote: "r.example", pong: "PONG", infoServer: { redis_version: "7.2.4" }, infoMemory: { maxmemory_policy: "noeviction" } };
  assert.ok(evaluerRedis(base).every(([n]) => n === "ok"));
  assert.ok(evaluerRedis({ ...base, infoMemory: { maxmemory_policy: "allkeys-lru" } }).some(([n, c]) => n === "error" && c === "REDIS-EVICTION"));
  assert.ok(evaluerRedis({ ...base, infoServer: { redis_version: "4.0.9" } }).some(([n, c]) => n === "error" && c === "REDIS-VERSION"));
  assert.ok(evaluerRedis({ ...base, protocole: "redis:" }).some(([n, c]) => n === "warning" && c === "REDIS-NO-TLS"));
});
