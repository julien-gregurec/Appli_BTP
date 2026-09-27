import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { analyserCle, autoriserExecution, analyserArguments } from "./stripe-ordering-test-mode.mjs";

const ENTREPRISE = "11111111-1111-4111-8111-111111111111";
const PRIX = { STRIPE_PRICE_PRO_MENSUEL: "price_pro_test", STRIPE_PRICE_BUSINESS_MENSUEL: "price_biz_test" };
const cleTest = ["sk", "test", "exemple"].join("_");
const cleLive = ["sk", "live", "exemple"].join("_");
const cleRestreinteLive = ["rk", "live", "exemple"].join("_");

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

test("--execute exige clé test, confirmation, entreprise UUID et prix non live", () => {
  const args = analyserArguments(["--execute", "--confirm-test", "--entreprise", ENTREPRISE]);
  assert.equal(autoriserExecution(args, { STRIPE_SECRET_KEY: cleLive, ...PRIX }).motif, "cle_live_refusee");
  assert.equal(autoriserExecution(args, { ...PRIX }).motif, "cle_absente");
  assert.equal(autoriserExecution(analyserArguments(["--execute", "--entreprise", ENTREPRISE]), { STRIPE_SECRET_KEY: cleTest, ...PRIX }).motif, "confirmation_absente");
  assert.equal(autoriserExecution(analyserArguments(["--execute", "--confirm-test", "--entreprise", "x"]), { STRIPE_SECRET_KEY: cleTest, ...PRIX }).motif, "entreprise_invalide");
  assert.equal(autoriserExecution(args, { STRIPE_SECRET_KEY: cleTest }).motif, "prix_absents");
  assert.equal(autoriserExecution(args, { STRIPE_SECRET_KEY: cleTest, STRIPE_PRICE_PRO_MENSUEL: "price_live_x", STRIPE_PRICE_BUSINESS_MENSUEL: "price_b" }).motif, "prix_live_refuse");
  assert.equal(autoriserExecution(args, { STRIPE_SECRET_KEY: cleTest, ...PRIX }).autorise, true);
});

test("CLI : une clé live avec --execute sort en erreur SANS réseau et sans afficher la clé", () => {
  const r = spawnSync(process.execPath, ["scripts/qualification/stripe-ordering-test-mode.mjs", "--execute", "--confirm-test", "--entreprise", ENTREPRISE], {
    env: { PATH: process.env.PATH, STRIPE_SECRET_KEY: cleLive, ...PRIX },
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /cle_live_refusee/);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(cleLive));
});

test("CLI : sans argument, plan affiché, sortie 0, aucun appel réseau", () => {
  const r = spawnSync(process.execPath, ["scripts/qualification/stripe-ordering-test-mode.mjs"], { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Aucun appel réseau : plan_seul/);
});
