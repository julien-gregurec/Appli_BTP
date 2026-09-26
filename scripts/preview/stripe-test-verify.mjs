#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview : vérification Stripe TEST (lecture seule, GET uniquement).
 *
 * Contrôle, sur le compte Stripe Test de la Preview :
 *   1. la clé est une clé test (sk_test_/rk_test_) — une clé live est refusée AVANT tout réseau ;
 *   2. endpoints webhook : pour chaque route du périmètre, un endpoint `enabled`, livemode=false,
 *      dont l'URL vise l'origine GP Preview + la route, abonné EXACTEMENT aux événements traités
 *      par le code (manquant = erreur ; en trop = avertissement : sur l'abonnement, un événement non
 *      traité crée quand même une ligne abonnement_evenements, et répond 422/503 si l'entreprise
 *      est introuvable) ;
 *   3. portail client : configuration STRIPE_PORTAL_CONFIGURATION_ID si posée, sinon configuration
 *      par défaut active — changement de prix, annulation en fin de période, factures, moyen de paiement ;
 *   4. prix : chaque STRIPE_PRICE_* de forfait posé existe, actif, livemode=false, récurrent
 *      (le contrôle des MONTANTS reste `npm run verify:stripe-prices`) ;
 *   5. Tools (si STRIPE_TOOLS_SECRET_KEY posée) : même contrôle sur le compte Tools.
 *
 * Usage :
 *   node scripts/preview/stripe-test-verify.mjs --env-file ~/elsatia-preview/gp.env --gp-origin https://<gp>.vercel.app \
 *        [--scope abonnement,tools] [--allow-custom-domain]
 * Aucun secret affiché ; aucune écriture (aucune requête autre que GET).
 * Sortie : 0 GO · 1 NO-GO · 2 refus.
 */
import {
  Refus, SORTIE, chargerFichierEnv, estDefinie, estPointEntree, exigerCleStripeTest, exigerOriginePreview,
  ligne, lireOptions, refuserProduction,
} from "./lib/preview-guard.mjs";

const API = "https://api.stripe.com";

/** Événements traités par chaque route (vérifiés dans le code du train canonique V2). */
export const ENDPOINTS = {
  abonnement: {
    route: "/api/stripe/abonnement/webhook",
    secret: "STRIPE_WEBHOOK_ABONNEMENT_SECRET",
    compte: "principal",
    events: [
      "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
      "customer.subscription.deleted", "invoice.created", "invoice.paid", "invoice.payment_failed",
      "invoice.payment_action_required",
    ],
  },
  tools: {
    route: "/api/tools/monetization/stripe/webhook",
    secret: "STRIPE_TOOLS_WEBHOOK_SECRET",
    compte: "tools",
    events: [
      "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
      "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "charge.refunded",
    ],
  },
  connect: {
    route: "/api/stripe/webhook",
    secret: "STRIPE_WEBHOOK_SECRET",
    compte: "principal",
    events: ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "account.updated"],
  },
  boutique: {
    route: "/api/stripe/boutique/webhook",
    secret: "STRIPE_WEBHOOK_BOUTIQUE_SECRET",
    compte: "principal",
    events: ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired"],
  },
};

export const PRIX_FORFAITS = ["MINI", "PRO", "BUSINESS", "ENTREPRISE"].flatMap((o) => ["MENSUEL", "ANNUEL"].map((p) => `STRIPE_PRICE_${o}_${p}`));

/** Pure : évalue les endpoints Stripe contre le périmètre attendu. */
export function evaluerEndpoints(endpoints, { gpOrigin, scope }) {
  const out = [];
  for (const nom of scope) {
    const attendu = ENDPOINTS[nom];
    const cible = `${gpOrigin}${attendu.route}`;
    const candidats = endpoints.filter((e) => typeof e.url === "string" && e.url.split("?")[0].replace(/\/+$/, "") === cible);
    if (!candidats.length) { out.push({ niveau: "error", code: "STRIPE-ENDPOINT-MISSING", sujet: nom, message: `aucun endpoint vers l'origine GP + ${attendu.route}` }); continue; }
    if (candidats.length > 1) out.push({ niveau: "warning", code: "STRIPE-ENDPOINT-DUPLICATE", sujet: nom, message: `${candidats.length} endpoints pour la même URL : chaque événement serait livré plusieurs fois (idempotence requise)` });
    const e = candidats.find((c) => c.status === "enabled") ?? candidats[0];
    if (e.status !== "enabled") out.push({ niveau: "error", code: "STRIPE-ENDPOINT-DISABLED", sujet: nom, message: "endpoint désactivé" });
    if (e.livemode) out.push({ niveau: "error", code: "STRIPE-ENDPOINT-LIVE", sujet: nom, message: "endpoint en mode live" });
    const recus = new Set(e.enabled_events ?? []);
    if (recus.has("*")) { out.push({ niveau: "warning", code: "STRIPE-ENDPOINT-WILDCARD", sujet: nom, message: "abonné à tous les événements (*) : restreindre à la liste traitée" }); continue; }
    const manquants = attendu.events.filter((ev) => !recus.has(ev));
    const enTrop = [...recus].filter((ev) => !attendu.events.includes(ev));
    if (manquants.length) out.push({ niveau: "error", code: "STRIPE-EVENTS-MISSING", sujet: nom, message: manquants.join(", ") });
    if (enTrop.length) out.push({ niveau: "warning", code: "STRIPE-EVENTS-EXTRA", sujet: nom, message: enTrop.join(", ") });
    if (!manquants.length && e.status === "enabled" && !e.livemode) out.push({ niveau: "ok", code: "STRIPE-ENDPOINT", sujet: nom, message: `${attendu.events.length} événements, activé, test` });
  }
  // Endpoints vers une autre origine : informatif (autre Preview, ancien alias).
  const autres = endpoints.filter((e) => typeof e.url === "string" && !e.url.startsWith(gpOrigin));
  if (autres.length) out.push({ niveau: "info", code: "STRIPE-ENDPOINT-OTHER", sujet: "compte", message: `${autres.length} endpoint(s) vers une autre origine (ancien alias ? le désactiver, ne jamais le supprimer)` });
  return out;
}

/** Pure : évalue une configuration de portail. */
export function evaluerPortail(conf) {
  const out = [];
  if (!conf) return [{ niveau: "error", code: "STRIPE-PORTAL-MISSING", sujet: "portail", message: "aucune configuration active" }];
  const f = conf.features ?? {};
  if (conf.livemode) out.push({ niveau: "error", code: "STRIPE-PORTAL-LIVE", sujet: "portail", message: "configuration live" });
  if (!conf.active) out.push({ niveau: "error", code: "STRIPE-PORTAL-INACTIVE", sujet: "portail", message: "configuration inactive" });
  if (!f.subscription_update?.enabled) out.push({ niveau: "warning", code: "STRIPE-PORTAL-UPDATE", sujet: "portail", message: "changement de forfait désactivé" });
  else if (!(f.subscription_update.products ?? []).length) out.push({ niveau: "warning", code: "STRIPE-PORTAL-PRODUCTS", sujet: "portail", message: "changement de forfait sans produits/prix listés" });
  if (!f.subscription_cancel?.enabled) out.push({ niveau: "warning", code: "STRIPE-PORTAL-CANCEL", sujet: "portail", message: "annulation désactivée" });
  else if (f.subscription_cancel.mode !== "at_period_end") out.push({ niveau: "warning", code: "STRIPE-PORTAL-CANCEL-MODE", sujet: "portail", message: "annulation immédiate (attendu : fin de période)" });
  if (!f.invoice_history?.enabled) out.push({ niveau: "warning", code: "STRIPE-PORTAL-INVOICES", sujet: "portail", message: "historique des factures désactivé" });
  if (!f.payment_method_update?.enabled) out.push({ niveau: "warning", code: "STRIPE-PORTAL-PM", sujet: "portail", message: "mise à jour du moyen de paiement désactivée" });
  if (!out.length) out.push({ niveau: "ok", code: "STRIPE-PORTAL", sujet: "portail", message: "active, test, 4 fonctions attendues" });
  return out;
}

/** Pure : évalue un Price. */
export function evaluerPrix(nom, prix) {
  if (!prix) return { niveau: "error", code: "STRIPE-PRICE-NOT-FOUND", sujet: nom, message: "introuvable sur ce compte test" };
  if (prix.livemode) return { niveau: "error", code: "STRIPE-PRICE-LIVE", sujet: nom, message: "Price live" };
  if (!prix.active) return { niveau: "error", code: "STRIPE-PRICE-INACTIVE", sujet: nom, message: "Price archivé" };
  if (!prix.recurring) return { niveau: "error", code: "STRIPE-PRICE-NOT-RECURRING", sujet: nom, message: "Price non récurrent" };
  const attendu = nom.endsWith("_ANNUEL") || nom.endsWith("_ANNUAL") ? "year" : "month";
  if (prix.recurring.interval !== attendu) return { niveau: "error", code: "STRIPE-PRICE-INTERVAL", sujet: nom, message: `intervalle ${prix.recurring.interval}, attendu ${attendu}` };
  return { niveau: "ok", code: "STRIPE-PRICE", sujet: nom, message: `actif, test, ${attendu}` };
}

function client(cle, fetchImpl) {
  return async (chemin) => {
    const r = await fetchImpl(`${API}${chemin}`, { method: "GET", headers: { Authorization: `Bearer ${cle}` }, signal: AbortSignal.timeout(10000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Stripe GET ${chemin.split("?")[0]} → HTTP ${r.status}`);
    return r.json();
  };
}

export async function executer({ env, gpOrigin, scope }, { fetchImpl = fetch, log = console.log } = {}) {
  refuserProduction(env);
  exigerCleStripeTest(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
  if (scope.includes("tools")) exigerCleStripeTest(env.STRIPE_TOOLS_SECRET_KEY, "STRIPE_TOOLS_SECRET_KEY");
  const constats = [];
  const get = client(env.STRIPE_SECRET_KEY, fetchImpl);

  const endpointsPrincipal = (await get("/v1/webhook_endpoints?limit=100"))?.data ?? [];
  constats.push(...evaluerEndpoints(endpointsPrincipal, { gpOrigin, scope: scope.filter((s) => ENDPOINTS[s].compte === "principal") }));

  const portail = estDefinie(env.STRIPE_PORTAL_CONFIGURATION_ID)
    ? await get(`/v1/billing_portal/configurations/${encodeURIComponent(env.STRIPE_PORTAL_CONFIGURATION_ID.trim())}`)
    : ((await get("/v1/billing_portal/configurations?is_default=true&limit=1"))?.data ?? [])[0];
  constats.push(...evaluerPortail(portail));

  for (const nom of PRIX_FORFAITS) {
    if (!estDefinie(env[nom])) { constats.push({ niveau: "error", code: "STRIPE-PRICE-ENV", sujet: nom, message: "variable absente (forfait vendu en Preview)" }); continue; }
    constats.push(evaluerPrix(nom, await get(`/v1/prices/${encodeURIComponent(env[nom].trim())}`)));
  }

  if (scope.includes("tools")) {
    const getTools = client(env.STRIPE_TOOLS_SECRET_KEY, fetchImpl);
    const endpointsTools = (await getTools("/v1/webhook_endpoints?limit=100"))?.data ?? [];
    constats.push(...evaluerEndpoints(endpointsTools, { gpOrigin, scope: ["tools"] }));
    for (const nom of ["STRIPE_TOOLS_PRICE_MONTHLY", "STRIPE_TOOLS_PRICE_ANNUAL"]) {
      if (!estDefinie(env[nom])) { constats.push({ niveau: "error", code: "STRIPE-PRICE-ENV", sujet: nom, message: "variable absente" }); continue; }
      constats.push(evaluerPrix(nom, await getTools(`/v1/prices/${encodeURIComponent(env[nom].trim())}`)));
    }
  }

  for (const nom of scope) if (!estDefinie(env[ENDPOINTS[nom].secret])) constats.push({ niveau: "error", code: "STRIPE-WHSEC-ENV", sujet: ENDPOINTS[nom].secret, message: "secret de signature absent de l'environnement GP" });

  log("ELSATIA — vérification Stripe TEST (GET uniquement, aucun secret affiché)\n");
  let erreurs = 0;
  for (const c of constats) {
    if (c.niveau === "error") erreurs += 1;
    log(ligne(c.niveau === "error" ? "ko" : c.niveau === "warning" ? "warn" : c.niveau === "ok" ? "ok" : "info", c.code, c.sujet, c.message));
  }
  log(erreurs ? `\nNO-GO : ${erreurs} erreur(s).` : "\nGO : Stripe Test conforme. Montants : npm run verify:stripe-prices -- --strict");
  return erreurs ? SORTIE.NO_GO : SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  try {
    if (typeof o["env-file"] !== "string") throw new Refus("--env-file <gp.env Preview> est obligatoire");
    if (typeof o["gp-origin"] !== "string") throw new Refus("--gp-origin <https://… origine GP Preview> est obligatoire");
    const gpOrigin = exigerOriginePreview(o["gp-origin"], { domainePersonnaliseAutorise: Boolean(o["allow-custom-domain"]) });
    const scope = (typeof o.scope === "string" ? o.scope : "abonnement").split(",").map((s) => s.trim());
    for (const s of scope) if (!ENDPOINTS[s]) throw new Refus(`--scope inconnu : ${s} (abonnement, tools, connect, boutique)`);
    process.exitCode = await executer({ env: chargerFichierEnv(o["env-file"]), gpOrigin, scope });
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; }
    else { console.error(`ÉCHEC : ${error instanceof Error ? error.message : String(error)}`); process.exitCode = SORTIE.NO_GO; }
  }
}
