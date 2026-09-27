import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { analyserArguments, analyserCle, autoriserExecution, essaiCheckout, executer, matriceJours } from "./stripe-trial-test-mode.mjs";

const ENTREPRISE = "11111111-1111-4111-8111-111111111111";
const PRIX = { STRIPE_PRICE_PRO_MENSUEL: "price_pro_test" };
const cleTest = ["sk", "test", "exemple"].join("_");
const cleLive = ["sk", "live", "exemple"].join("_");
const cleRestreinteLive = ["rk", "live", "exemple"].join("_");
const ARGS = ["--execute", "--confirm-test", "--entreprise", ENTREPRISE, "--customer", "cus_Test123", "--essai-debut", "2026-10-01", "--essai-fin", "2026-10-31"];

test("clé live refusée, clé test acceptée, clé absente ou inconnue refusée", () => {
  assert.deepEqual(analyserCle(cleLive), { ok: false, motif: "cle_live_refusee" });
  assert.deepEqual(analyserCle(cleRestreinteLive), { ok: false, motif: "cle_live_refusee" });
  assert.equal(analyserCle(cleTest).ok, true);
  assert.equal(analyserCle(undefined).motif, "cle_absente");
  assert.equal(analyserCle("pk_test_x").motif, "cle_inconnue");
});

test("sans --execute : plan seul, même avec une clé", () => {
  assert.equal(autoriserExecution(analyserArguments([]), { STRIPE_SECRET_KEY: cleTest, ...PRIX }).motif, "plan_seul");
});

test("--execute : la clé live est refusée AVANT toute autre validation", () => {
  assert.equal(autoriserExecution(analyserArguments(["--execute"]), { STRIPE_SECRET_KEY: cleLive }).motif, "cle_live_refusee");
  assert.equal(autoriserExecution(analyserArguments(ARGS), { STRIPE_SECRET_KEY: cleLive, ...PRIX }).motif, "cle_live_refusee");
});

test("--execute exige confirmation, entreprise, customer, essai valide et prix non live", () => {
  const env = { STRIPE_SECRET_KEY: cleTest, ...PRIX };
  const sans = (option, n = 2) => { const a = [...ARGS]; a.splice(a.indexOf(option), n); return analyserArguments(a); };
  assert.equal(autoriserExecution(sans("--confirm-test", 1), env).motif, "confirmation_absente");
  assert.equal(autoriserExecution(sans("--entreprise"), env).motif, "entreprise_invalide");
  assert.equal(autoriserExecution(sans("--customer"), env).motif, "customer_invalide");
  assert.equal(autoriserExecution(sans("--essai-fin"), env).motif, "essai_invalide");
  const dateImpossible = [...ARGS]; dateImpossible[dateImpossible.indexOf("2026-10-31")] = "2026-02-30";
  assert.equal(autoriserExecution(analyserArguments(dateImpossible), env).motif, "essai_invalide");
  assert.equal(autoriserExecution(analyserArguments([...ARGS, "--subscription", "x"]), env).motif, "subscription_invalide");
  assert.equal(autoriserExecution(analyserArguments(ARGS), { STRIPE_SECRET_KEY: cleTest }).motif, "prix_absent");
  assert.equal(autoriserExecution(analyserArguments(ARGS), { STRIPE_SECRET_KEY: cleTest, STRIPE_PRICE_PRO_MENSUEL: "price_live_x" }).motif, "prix_live_refuse");
  assert.equal(autoriserExecution(analyserArguments(ARGS), env).autorise, true);
});

test("essaiCheckout : trial_end = fin locale, jamais < 48 h, jamais au-delà de début + 30", () => {
  const fin = Date.parse("2026-10-31T23:59:59Z") / 1000;
  assert.deepEqual(essaiCheckout("2026-10-01", "2026-10-31", Date.parse("2026-10-16T09:00:00Z") / 1000).trialEnd, fin);
  assert.equal(essaiCheckout("2026-10-01", "2026-12-31", Date.parse("2026-10-16T09:00:00Z") / 1000).trialEnd, fin);
  assert.equal(essaiCheckout("2026-10-01", "2026-10-31", Date.parse("2026-10-30T09:00:00Z") / 1000).raison, "restant_inferieur_minimum_stripe");
  assert.equal(essaiCheckout("2026-10-01", "2026-10-31", Date.parse("2026-11-01T00:00:00Z") / 1000).raison, "essai_expire");
  assert.equal(essaiCheckout("2026-10-01", "2026-09-01", 0).raison, "dates_incoherentes");
});

test("matrice : jours 0/1/15/28 avec essai, 29/30/expiré sans essai", () => {
  const maintenant = Date.parse("2026-10-16T09:00:00Z") / 1000;
  const modes = Object.fromEntries(matriceJours(maintenant).map((c) => [c.libelle, c.essai.mode]));
  assert.deepEqual(modes, { "jour 0": "trial_end", "jour 1": "trial_end", "jour 15": "trial_end", "jour 28": "trial_end", "jour 29": "aucun", "jour 30": "aucun", "expiré": "aucun" });
  for (const cas of matriceJours(maintenant)) {
    if (cas.essai.mode === "trial_end") assert.ok(new Date(cas.essai.trialEnd * 1000).toISOString().slice(0, 10) <= cas.fin);
  }
});

test("CLI : une clé live avec --execute sort en erreur SANS réseau et sans afficher la clé", () => {
  const r = spawnSync(process.execPath, ["scripts/qualification/stripe-trial-test-mode.mjs", ...ARGS], {
    // Tout appel réseau échouerait : proxy volontairement invalide.
    env: { PATH: process.env.PATH, STRIPE_SECRET_KEY: cleLive, ...PRIX, HTTPS_PROXY: "http://127.0.0.1:9" },
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Aucun appel réseau : cle_live_refusee/);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(cleLive));
});

test("CLI : sans argument, plan affiché, sortie 0, aucun appel réseau", () => {
  const r = spawnSync(process.execPath, ["scripts/qualification/stripe-trial-test-mode.mjs"], { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Aucun appel réseau : plan_seul/);
});

/** Faux Stripe (hors réseau) : règle 48 h, idempotence qui rejoue la réponse d'origine, expiration. */
function fauxStripe(trialEndSubscription) {
  const sessions = new Map();
  const cles = new Map();
  const appels = [];
  let n = 0;
  const maintenant = () => Math.floor(Date.now() / 1000);
  const rep = (status, json) => ({ ok: status < 400, status, json: async () => structuredClone(json) });
  const fetchImpl = async (url, options = {}) => {
    const [chemin, requete = ""] = url.replace("https://api.stripe.com/v1/", "").split("?");
    const methode = options.method ?? "GET";
    appels.push(`${methode} ${chemin}`);
    assert.ok(url.startsWith("https://api.stripe.com/v1/"));
    const cle = options.headers?.["Idempotency-Key"];
    if (cle && cles.has(cle)) return rep(200, cles.get(cle));
    const corps = Object.fromEntries(new URLSearchParams(options.body?.toString() ?? ""));
    const q = new URLSearchParams(requete);
    let r;
    if (methode === "POST" && chemin === "checkout/sessions") {
      const te = corps["subscription_data[trial_end]"];
      if (te && Number(te) < maintenant() + 48 * 3600) return rep(400, { error: { message: "trial_end must be at least 48 hours in the future" } });
      const s = { id: `cs_f${++n}`, url: `https://checkout.invalid/${n}`, status: "open", customer: corps.customer, metadata: { entreprise_id: corps["metadata[entreprise_id]"], elsatia_qualification: corps["metadata[elsatia_qualification]"] }, livemode: false };
      sessions.set(s.id, s);
      r = { ...s };
    } else if (methode === "POST" && /\/expire$/.test(chemin)) {
      const s = sessions.get(chemin.split("/")[2]);
      if (!s || s.status !== "open") return rep(400, { error: { message: "Only open sessions can be expired" } });
      s.status = "expired";
      r = { ...s };
    } else if (methode === "GET" && chemin === "checkout/sessions") {
      r = { data: [...sessions.values()].filter((s) => s.customer === q.get("customer") && s.status === q.get("status")) };
    } else if (methode === "GET" && chemin.startsWith("checkout/sessions/")) {
      r = { ...sessions.get(chemin.split("/")[2]) };
    } else if (methode === "GET" && chemin === "subscriptions") {
      r = { data: [] };
    } else if (methode === "GET" && chemin.startsWith("subscriptions/")) {
      r = { id: chemin.split("/")[1], status: "trialing", trial_end: trialEndSubscription, livemode: false };
    } else {
      throw new Error(`appel non prévu ${methode} ${chemin}`);
    }
    if (cle) cles.set(cle, r);
    return rep(200, r);
  };
  return { fetchImpl, sessions, appels };
}

test("exécution simulée (faux Stripe, aucun réseau) : scénario complet conforme, une seule session réelle ouverte", async () => {
  const debut = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  const fin = new Date(Date.parse(`${debut}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  // La subscription issue du Checkout réel porte trial_end = fin locale T23:59:59Z.
  const faux = fauxStripe(Date.parse(`${fin}T23:59:59Z`) / 1000);
  const args = analyserArguments([...ARGS.map((a) => (a === "2026-10-01" ? debut : a === "2026-10-31" ? fin : a)), "--subscription", "sub_Test1"]);
  const logs = [];
  const { log, table, error } = console;
  console.log = (...m) => logs.push(m.join(" "));
  console.table = (t) => logs.push(JSON.stringify(t));
  console.error = (...m) => logs.push(m.join(" "));
  const sortie = process.exit;
  let code = null;
  process.exit = (c) => { code = c; throw new Error("exit"); };
  try {
    await executer(args, { STRIPE_SECRET_KEY: cleTest, ...PRIX }, faux.fetchImpl);
  } catch (e) {
    if (e.message !== "exit") throw e;
  } finally {
    Object.assign(console, { log, table, error });
    process.exit = sortie;
  }
  assert.equal(code, null, logs.join("\n"));
  const tableau = JSON.parse(logs.find((l) => l.startsWith("[")));
  assert.ok(tableau.every((ligne) => ligne.conforme), JSON.stringify(tableau));
  assert.ok(tableau.some((l) => l.cas === "2 sessions simultanées → balayage" && /avant: 2, après: 1/.test(l.stripe)));
  assert.ok(tableau.some((l) => l.cas === "clé rejouée après expiration" && /état relu: expired/.test(l.stripe)));
  // Seule la session du Checkout réel de l'entreprise reste ouverte.
  assert.equal([...faux.sessions.values()].filter((s) => s.status === "open").length, 1);
});

test("exécution simulée : une subscription dont le trial dépasse la fin locale fait échouer le scénario (sortie 1)", async () => {
  const debut = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  const fin = new Date(Date.parse(`${debut}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const faux = fauxStripe(Date.parse(`${fin}T23:59:59Z`) / 1000 + 86_400);
  const args = analyserArguments([...ARGS.map((a) => (a === "2026-10-01" ? debut : a === "2026-10-31" ? fin : a)), "--subscription", "sub_Test1"]);
  const { log, table, error } = console;
  console.log = console.table = console.error = () => {};
  const sortie = process.exit;
  let code = null;
  process.exit = (c) => { code = c; throw new Error("exit"); };
  try {
    await executer(args, { STRIPE_SECRET_KEY: cleTest, ...PRIX }, faux.fetchImpl);
  } catch (e) {
    if (e.message !== "exit") throw e;
  } finally {
    Object.assign(console, { log, table, error });
    process.exit = sortie;
  }
  assert.equal(code, 1);
});
