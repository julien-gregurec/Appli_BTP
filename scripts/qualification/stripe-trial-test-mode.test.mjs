import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { analyserArguments, analyserCle, autoriserExecution, essaiCheckout, matriceJours } from "./stripe-trial-test-mode.mjs";

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
