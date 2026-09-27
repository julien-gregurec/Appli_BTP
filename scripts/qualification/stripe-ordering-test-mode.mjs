#!/usr/bin/env node
// ELSATIA-STRIPE-EVENT-ORDERING-REPLAY-HARDENING-V1 — scénario Stripe TEST MODE
// distant, PRÉPARÉ mais jamais exécuté par la mission (aucune clé test fournie).
//
// Garde-fous (vérifiés AVANT tout appel réseau) :
//   - sans --execute : affiche le plan, aucun appel réseau ;
//   - clé absente → refus ; clé `sk_live_` / `rk_live_` → REFUS définitif ;
//     seules `sk_test_` / `rk_test_` sont acceptées ;
//   - --execute exige aussi --entreprise <uuid> et --confirm-test.
//
// Scénario (Test Clock Stripe, aucun temps réel attendu) :
//   1. test clock + client (metadata.entreprise_id) + carte pm_card_visa ;
//   2. abonnement avec essai de 30 jours (metadata entreprise/offre/périodicité) ;
//   3. upgrade → downgrade → cancel_at_period_end → reactivate (événements portail) ;
//   4. carte qui échoue (pm_card_chargeCustomerFail), avance de l'horloge après
//      l'essai → invoice.payment_failed → SUSPENSION IMMÉDIATE attendue ;
//   5. carte valide + paiement de la facture → invoice.paid → actif ;
//   6. (option --3ds) carte pm_card_authenticationRequired au renouvellement
//      suivant → invoice.payment_action_required : l'événement facture ne
//      suspend pas (voir §8 du rapport pour l'abonnement past_due) ;
//   7. imprime les commandes `stripe events resend` pour REJOUER l'ancien
//      invoice.payment_failed APRÈS invoice.paid (ordre inversé) et 3× le même
//      événement (doublons), puis la requête SQL de vérification attendue.
//
// Prérequis côté ELSATIA : idéalement une entreprise créée le MÊME JOUR UTC
// (essai local = essai Stripe). Depuis la migration 20260927000507
// (ELSATIA_STRIPE_TRIAL_SYNCHRONIZATION_V1, finding F-1 fermé), un trial_end
// Stripe au-delà de essai_debut + 30 ne fait plus échouer le webhook : il est
// borné à l'essai local et journalisé dans stripe_essai_ecarts.
//
// Usage :
//   node scripts/qualification/stripe-ordering-test-mode.mjs                # plan seul
//   STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_PRO_MENSUEL=price_… STRIPE_PRICE_BUSINESS_MENSUEL=price_… \
//     node scripts/qualification/stripe-ordering-test-mode.mjs --execute --confirm-test --entreprise <uuid> [--3ds]

import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Classe une clé Stripe sans jamais la renvoyer ni l'afficher. */
export function analyserCle(cle) {
  if (!cle) return { ok: false, motif: "cle_absente" };
  if (/^(sk|rk)_live_/.test(cle)) return { ok: false, motif: "cle_live_refusee" };
  if (/^(sk|rk)_test_/.test(cle)) return { ok: true, motif: "cle_test" };
  return { ok: false, motif: "cle_inconnue" };
}

export function analyserArguments(argv) {
  const execute = argv.includes("--execute");
  const confirme = argv.includes("--confirm-test");
  const i = argv.indexOf("--entreprise");
  const entreprise = i >= 0 ? argv[i + 1] ?? null : null;
  return { execute, confirme, entreprise, troisDS: argv.includes("--3ds") };
}

/** Décide, sans réseau, si l'exécution distante est autorisée. */
export function autoriserExecution({ execute, confirme, entreprise }, env) {
  if (!execute) return { autorise: false, motif: "plan_seul" };
  const cle = analyserCle(env.STRIPE_SECRET_KEY);
  if (!cle.ok) return { autorise: false, motif: cle.motif };
  if (!confirme) return { autorise: false, motif: "confirmation_absente" };
  if (!entreprise || !UUID.test(entreprise)) return { autorise: false, motif: "entreprise_invalide" };
  if (!env.STRIPE_PRICE_PRO_MENSUEL || !env.STRIPE_PRICE_BUSINESS_MENSUEL) return { autorise: false, motif: "prix_absents" };
  if (/live/i.test(env.STRIPE_PRICE_PRO_MENSUEL + env.STRIPE_PRICE_BUSINESS_MENSUEL)) return { autorise: false, motif: "prix_live_refuse" };
  return { autorise: true, motif: "ok" };
}

export function sqlVerification(entreprise) {
  return `-- État attendu après rejeu désordonné : actif, l'ancien payment_failed journalisé « perime ».
select abonnement_statut, abonnement_dernier_evenement_at, derniere_facture_stripe_id
  from public.entreprises where id = '${entreprise}';
select stripe_event_type, stripe_event_created, objet_type, objet_id, decision, transition, motif, processed_at
  from public.stripe_evenements_ordre where entreprise_id = '${entreprise}' order by id;
select stripe_event_id, type, statut_resultant, livraisons_doublons
  from public.abonnement_evenements where entreprise_id = '${entreprise}' order by created_at;`;
}

export const PLAN = [
  "test_clock + customer(metadata.entreprise_id) + pm_card_visa",
  "subscription pro/mensuel, trial 30 j → customer.subscription.created, invoice.paid (0 €)",
  "upgrade business → customer.subscription.updated",
  "downgrade pro → customer.subscription.updated",
  "cancel_at_period_end=true → customer.subscription.updated (accès conservé)",
  "reactivate (cancel_at_period_end=false) → customer.subscription.updated",
  "pm_card_chargeCustomerFail + avance horloge après l'essai → invoice.payment_failed → suspendu",
  "pm_card_visa + invoices/{id}/pay → invoice.paid → actif",
  "(--3ds) pm_card_authenticationRequired + renouvellement → invoice.payment_action_required",
  "stripe events resend <payment_failed> APRÈS invoice.paid → attendu : périmé, reste actif",
  "stripe events resend <payment_failed> ×3 → attendu : duplicate, livraisons_doublons incrémenté",
];

async function executer({ entreprise, troisDS }, env) {
  const secret = env.STRIPE_SECRET_KEY;
  const appel = async (chemin, corps, methode = "POST") => {
    const reponse = await fetch(`https://api.stripe.com/v1/${chemin}`, {
      method: methode,
      headers: { Authorization: `Bearer ${secret}`, ...(corps ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: corps ? new URLSearchParams(corps) : undefined,
    });
    const donnees = await reponse.json();
    if (!reponse.ok) throw new Error(`${methode} ${chemin} : ${donnees.error?.message ?? reponse.status}`);
    if (donnees.livemode === true) throw new Error("Objet livemode reçu : arrêt immédiat");
    return donnees;
  };
  const attendreHorloge = async (id) => {
    for (let i = 0; i < 60; i++) {
      const h = await appel(`test_helpers/test_clocks/${id}`, null, "GET");
      if (h.status === "ready") return h;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Test clock non prête");
  };
  const maintenant = Math.floor(Date.now() / 1000);
  const horloge = await appel("test_helpers/test_clocks", { frozen_time: String(maintenant), name: "elsatia-ordre-v1" });
  const client = await appel("customers", { test_clock: horloge.id, "metadata[entreprise_id]": entreprise, payment_method: "pm_card_visa", "invoice_settings[default_payment_method]": "pm_card_visa" });
  const metadata = { "metadata[entreprise_id]": entreprise, "metadata[offre]": "pro", "metadata[periodicite]": "mensuel" };
  let sub = await appel("subscriptions", { customer: client.id, "items[0][price]": env.STRIPE_PRICE_PRO_MENSUEL, trial_period_days: "30", ...metadata });
  const item = sub.items.data[0].id;
  const maj = (params) => appel(`subscriptions/${sub.id}`, params);
  sub = await maj({ "items[0][id]": item, "items[0][price]": env.STRIPE_PRICE_BUSINESS_MENSUEL, "metadata[offre]": "business", proration_behavior: "none" });
  sub = await maj({ "items[0][id]": item, "items[0][price]": env.STRIPE_PRICE_PRO_MENSUEL, "metadata[offre]": "pro", proration_behavior: "none" });
  sub = await maj({ cancel_at_period_end: "true" });
  sub = await maj({ cancel_at_period_end: "false" });
  const echec = await appel(`payment_methods/pm_card_chargeCustomerFail/attach`, { customer: client.id }).catch(() => null)
    ?? await appel("payment_methods", { type: "card", "card[token]": "tok_chargeCustomerFail" });
  await appel(`customers/${client.id}`, { "invoice_settings[default_payment_method]": echec.id });
  await appel(`test_helpers/test_clocks/${horloge.id}/advance`, { frozen_time: String(maintenant + 31 * 86400) });
  await attendreHorloge(horloge.id);
  const factures = await appel(`invoices?customer=${client.id}&status=open&limit=1`, null, "GET");
  const facture = factures.data[0];
  if (!facture) throw new Error("Aucune facture ouverte après l'échec attendu");
  await appel(`customers/${client.id}`, { "invoice_settings[default_payment_method]": "pm_card_visa" });
  await appel(`invoices/${facture.id}/pay`, { payment_method: "pm_card_visa" });
  if (troisDS) {
    const tds = await appel(`payment_methods/pm_card_authenticationRequired/attach`, { customer: client.id });
    await appel(`customers/${client.id}`, { "invoice_settings[default_payment_method]": tds.id });
    await appel(`test_helpers/test_clocks/${horloge.id}/advance`, { frozen_time: String(maintenant + 62 * 86400) });
    await attendreHorloge(horloge.id);
  }
  const echecs = await appel(`events?type=invoice.payment_failed&limit=10`, null, "GET");
  const evtEchec = echecs.data.find((e) => e.data?.object?.id === facture.id);
  console.log(JSON.stringify({ horloge: horloge.id, client: client.id, abonnement: sub.id, facture: facture.id, evenement_echec: evtEchec?.id ?? null }, null, 2));
  console.log("\n# Rejeu désordonné et doublons (Stripe CLI, endpoint Test de la Preview) :");
  console.log(`stripe events resend ${evtEchec?.id ?? "<evt_payment_failed>"} --webhook-endpoint <we_…>`);
  console.log(`for i in 1 2 3; do stripe events resend ${evtEchec?.id ?? "<evt_payment_failed>"} --webhook-endpoint <we_…>; done`);
  console.log("\n# Vérification (base Preview, lecture seule) :\n" + sqlVerification(entreprise));
  console.log(`\n# Nettoyage : stripe test_helpers test_clocks delete ${horloge.id}`);
}

async function main() {
  const args = analyserArguments(process.argv.slice(2));
  const decision = autoriserExecution(args, process.env);
  console.log("# Scénario Stripe Test — ordre / rejeu / doublons (ELSATIA V1)");
  PLAN.forEach((etape, i) => console.log(`  ${i + 1}. ${etape}`));
  if (!decision.autorise) {
    console.log(`\nAucun appel réseau : ${decision.motif}.`);
    if (args.entreprise && UUID.test(args.entreprise)) console.log("\n" + sqlVerification(args.entreprise));
    process.exit(decision.motif === "plan_seul" ? 0 : 2);
  }
  await executer(args, process.env);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((erreur) => { console.error(erreur instanceof Error ? erreur.message : "échec"); process.exit(1); });
}
