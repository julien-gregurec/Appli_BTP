import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { analyserArguments, analyserCle, autoriserExecution, executer, sqlVerification } from "./stripe-resubscription-test-mode.mjs";

const ENTREPRISE = "11111111-1111-4111-8111-111111111111";
const PRIX = { STRIPE_PRICE_PRO_MENSUEL: "price_pro_test" };
const cleTest = ["sk", "test", "exemple"].join("_");
const cleLive = ["sk", "live", "exemple"].join("_");
const cleRestreinteLive = ["rk", "live", "exemple"].join("_");
const ARGS = ["--execute", "--confirm-test", "--entreprise", ENTREPRISE, "--customer", "cus_Test123"];

test("clé live refusée, clé test acceptée, clé absente ou inconnue refusée", () => {
  assert.deepEqual(analyserCle(cleLive), { ok: false, motif: "cle_live_refusee" });
  assert.deepEqual(analyserCle(cleRestreinteLive), { ok: false, motif: "cle_live_refusee" });
  assert.equal(analyserCle(cleTest).ok, true);
  assert.equal(analyserCle(undefined).motif, "cle_absente");
  assert.equal(analyserCle("pk_test_x").motif, "cle_inconnue");
});

test("sans --execute : plan seul ; --execute : clé live refusée avant toute autre validation", () => {
  assert.equal(autoriserExecution(analyserArguments([]), { STRIPE_SECRET_KEY: cleTest, ...PRIX }).motif, "plan_seul");
  assert.equal(autoriserExecution(analyserArguments(["--execute"]), { STRIPE_SECRET_KEY: cleLive }).motif, "cle_live_refusee");
  assert.equal(autoriserExecution(analyserArguments(ARGS), { STRIPE_SECRET_KEY: cleLive, ...PRIX }).motif, "cle_live_refusee");
});

test("--execute exige confirmation, entreprise, customer existant et prix non live", () => {
  const env = { STRIPE_SECRET_KEY: cleTest, ...PRIX };
  const sans = (option, n = 2) => { const a = [...ARGS]; a.splice(a.indexOf(option), n); return analyserArguments(a); };
  assert.equal(autoriserExecution(sans("--confirm-test", 1), env).motif, "confirmation_absente");
  assert.equal(autoriserExecution(sans("--entreprise"), env).motif, "entreprise_invalide");
  assert.equal(autoriserExecution(sans("--customer"), env).motif, "customer_invalide");
  assert.equal(autoriserExecution(analyserArguments(ARGS), { STRIPE_SECRET_KEY: cleTest }).motif, "prix_absent");
  assert.equal(autoriserExecution(analyserArguments(ARGS), { STRIPE_SECRET_KEY: cleTest, STRIPE_PRICE_PRO_MENSUEL: "price_live_x" }).motif, "prix_live_refuse");
  assert.equal(autoriserExecution(analyserArguments(ARGS), env).ok, true);
});

test("exécution simulée hors réseau : même client, aucun essai, arrêt sur livemode", async () => {
  const appels = [];
  const faux = async (url, options) => {
    const chemin = url.replace("https://api.stripe.com/v1/", "");
    const corps = Object.fromEntries(options.body ?? []);
    appels.push({ methode: options.method, chemin, corps });
    const reponses = {
      "POST payment_methods/pm_card_visa/attach": { id: "pm_1" },
      "POST customers/cus_Test123": { id: "cus_Test123" },
      "POST subscriptions": { id: "sub_1", status: "active" },
      "POST billing_portal/sessions": { url: "https://billing.stripe.com/p/session" },
      "DELETE subscriptions/sub_1": { id: "sub_1", status: "canceled" },
      "GET subscriptions?customer=cus_Test123&status=all&limit=100": { data: [{ id: "sub_1", status: "canceled" }] },
      "POST checkout/sessions": { id: "cs_1", customer: "cus_Test123" },
      "POST checkout/sessions/cs_1/expire": { id: "cs_1", status: "expired" },
    };
    let json = reponses[`${options.method} ${chemin}`];
    if (chemin === "subscriptions/sub_1" && options.method === "POST") json = { id: "sub_1", cancel_at_period_end: corps.cancel_at_period_end === "true" };
    return { ok: true, json: async () => json };
  };
  const journal = await executer(analyserArguments(ARGS), { STRIPE_SECRET_KEY: cleTest, ...PRIX }, faux);
  assert.equal(journal.length, 4);
  const checkout = appels.find((a) => a.chemin === "checkout/sessions");
  assert.equal(checkout.corps.customer, "cus_Test123");
  assert.equal(checkout.corps["subscription_data[trial_end]"], undefined);
  assert.equal(checkout.corps["subscription_data[trial_period_days]"], undefined);
  assert.equal(appels.some((a) => a.methode === "POST" && a.chemin === "customers"), false);
  await assert.rejects(
    executer(analyserArguments(ARGS), { STRIPE_SECRET_KEY: cleTest, ...PRIX }, async () => ({ ok: true, json: async () => ({ livemode: true }) })),
    /livemode/,
  );
});

test("SQL de contrôle : lecture seule", () => {
  const sql = sqlVerification(ENTREPRISE);
  assert.match(sql, /stripe_subscriptions_remplacees/);
  assert.doesNotMatch(sql, /\b(insert|update|delete|drop|truncate)\b/i);
});

test("CLI : clé live refusée avant réseau (sortie 2, clé jamais affichée)", () => {
  const r = spawnSync(process.execPath, ["scripts/qualification/stripe-resubscription-test-mode.mjs", ...ARGS], {
    env: { ...process.env, STRIPE_SECRET_KEY: cleLive, ...PRIX },
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(cleLive));
});
