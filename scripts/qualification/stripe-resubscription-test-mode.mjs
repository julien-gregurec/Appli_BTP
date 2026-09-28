#!/usr/bin/env node
// ELSATIA — Stripe Resubscription Flow V1 — scénario Stripe TEST MODE distant,
// PRÉPARÉ mais jamais exécuté par la mission (aucune clé test fournie).
//
// Garde-fous (vérifiés AVANT tout appel réseau) :
//   - sans --execute : plan + SQL de contrôle, aucun appel réseau ;
//   - clé absente → refus ; clé `sk_live_` / `rk_live_` → REFUS définitif, avant
//     toute autre validation ; seules `sk_test_` / `rk_test_` sont acceptées ;
//   - --execute exige --confirm-test, --entreprise <uuid>, --customer cus_… (le
//     client Stripe DÉJÀ rattaché à l'entreprise de recette) et un prix non live ;
//   - tout objet `livemode: true` reçu arrête le script.
//
// Scénario (client de recette, carte de test pm_card_visa) :
//   1. subscription créée sur le client (sans essai) → active ;
//   2. cancel_at_period_end = true → le Portail Stripe s'ouvre pour ce client
//      (billing_portal/sessions) : c'est lui qui porte « Reprendre l'abonnement » ;
//      la reprise est simulée par cancel_at_period_end = false (même effet que le
//      bouton du Portail) → la subscription reste la même ;
//   3. annulation immédiate (DELETE) → canceled : la subscription n'est plus
//      réactivable ;
//   4. réabonnement : `subscriptions?status=all` ne doit montrer AUCUNE
//      subscription vivante ; une Checkout Session est créée sur le MÊME client,
//      SANS trial_end ni trial_period_days (essai consommé), puis expirée ;
//   5. SQL de contrôle imprimé : historique `stripe_subscriptions_remplacees`,
//      journal d'ordre (deleted / created / updated / invoice.*), statut final.
//
// Usage :
//   node scripts/qualification/stripe-resubscription-test-mode.mjs            # plan seul
//   STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_PRO_MENSUEL=price_… \
//     node scripts/qualification/stripe-resubscription-test-mode.mjs --execute --confirm-test \
//       --entreprise <uuid> --customer cus_…

import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Classe une clé Stripe sans jamais la renvoyer ni l'afficher. */
export function analyserCle(cle) {
  if (!cle) return { ok: false, motif: "cle_absente" };
  if (/^(sk|rk)_live_/.test(cle)) return { ok: false, motif: "cle_live_refusee" };
  if (/^(sk|rk)_test_/.test(cle)) return { ok: true, motif: "cle_test" };
  return { ok: false, motif: "cle_inconnue" };
}

function valeur(argv, option) {
  const i = argv.indexOf(option);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function analyserArguments(argv) {
  return {
    execute: argv.includes("--execute"),
    confirmTest: argv.includes("--confirm-test"),
    entreprise: valeur(argv, "--entreprise"),
    customer: valeur(argv, "--customer"),
  };
}

export function autoriserExecution(args, env) {
  if (!args.execute) return { ok: false, motif: "plan_seul" };
  const cle = analyserCle(env.STRIPE_SECRET_KEY);
  if (!cle.ok) return { ok: false, motif: cle.motif };
  if (!args.confirmTest) return { ok: false, motif: "confirmation_absente" };
  if (!args.entreprise || !UUID.test(args.entreprise)) return { ok: false, motif: "entreprise_invalide" };
  if (!args.customer || !/^cus_[A-Za-z0-9]+$/.test(args.customer)) return { ok: false, motif: "customer_invalide" };
  const prix = env.STRIPE_PRICE_PRO_MENSUEL;
  if (!prix || !/^price_/.test(prix)) return { ok: false, motif: "prix_absent" };
  if (/live/i.test(prix)) return { ok: false, motif: "prix_live_refuse" };
  return { ok: true, motif: "autorise" };
}

export function sqlVerification(entreprise) {
  return [
    `select abonnement_statut, stripe_subscription_id, stripe_customer_id, abonnement_essai_fin, abonnement_annulation_prevue_at from public.entreprises where id = '${entreprise}';`,
    `select stripe_subscription_id, remplacee_par, statut_stripe_observe, remplacee_at from public.stripe_subscriptions_remplacees where entreprise_id = '${entreprise}' order by remplacee_at;`,
    `select stripe_event_type, decision, transition, motif, stripe_event_created from public.stripe_evenements_ordre where entreprise_id = '${entreprise}' order by stripe_event_created, id;`,
    `select type, statut_resultant, traite_at from public.abonnement_evenements where entreprise_id = '${entreprise}' order by created_at desc limit 30;`,
  ].join("\n");
}

export const PLAN = [
  "1. subscription active sur le client de recette (pm_card_visa, sans essai)",
  "2. cancel_at_period_end=true → Portail ouvert → reprise (cancel_at_period_end=false), même subscription",
  "3. annulation immédiate → canceled (non réactivable)",
  "4. aucune subscription vivante → Checkout sur le MÊME client, sans essai, puis expiration",
  "5. SQL de contrôle (historique, journal d'ordre, statut) après les webhooks Preview",
];

export async function executer(args, env, fetchImpl = fetch) {
  const appel = async (methode, chemin, corps) => {
    const reponse = await fetchImpl(`https://api.stripe.com/v1/${chemin}`, {
      method: methode,
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        ...(corps ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: corps ? new URLSearchParams(corps) : undefined,
    });
    const donnees = await reponse.json();
    if (donnees && donnees.livemode === true) throw new Error("Objet livemode reçu : arrêt immédiat");
    if (!reponse.ok) throw new Error(`Stripe a refusé ${methode} ${chemin} : ${donnees?.error?.message ?? reponse.status}`);
    return donnees;
  };
  const journal = [];
  const pm = await appel("POST", "payment_methods/pm_card_visa/attach", { customer: args.customer });
  await appel("POST", `customers/${args.customer}`, { "invoice_settings[default_payment_method]": pm.id });
  const sub = await appel("POST", "subscriptions", {
    customer: args.customer,
    "items[0][price]": env.STRIPE_PRICE_PRO_MENSUEL,
    "metadata[entreprise_id]": args.entreprise, "metadata[offre]": "pro", "metadata[periodicite]": "mensuel",
  });
  journal.push(`1. ${sub.id} ${sub.status}`);
  const programmee = await appel("POST", `subscriptions/${sub.id}`, { cancel_at_period_end: "true" });
  const portail = await appel("POST", "billing_portal/sessions", { customer: args.customer, return_url: "https://example.invalid/abonnement" });
  const reprise = await appel("POST", `subscriptions/${sub.id}`, { cancel_at_period_end: "false" });
  journal.push(`2. programmée=${programmee.cancel_at_period_end} portail=${Boolean(portail.url)} reprise=${reprise.cancel_at_period_end === false && reprise.id === sub.id}`);
  const annulee = await appel("DELETE", `subscriptions/${sub.id}`);
  journal.push(`3. ${annulee.status}`);
  const liste = await appel("GET", `subscriptions?customer=${args.customer}&status=all&limit=100`);
  const vivantes = liste.data.filter((s) => !["canceled", "incomplete_expired"].includes(s.status));
  if (vivantes.length) throw new Error(`Subscription encore vivante : ${vivantes.map((s) => s.id).join(",")}`);
  const session = await appel("POST", "checkout/sessions", {
    mode: "subscription", customer: args.customer, payment_method_collection: "always",
    success_url: "https://example.invalid/succes?reabonnement=1", cancel_url: "https://example.invalid/annule?reabonnement=1",
    "line_items[0][price]": env.STRIPE_PRICE_PRO_MENSUEL, "line_items[0][quantity]": "1",
    "metadata[entreprise_id]": args.entreprise, "subscription_data[metadata][entreprise_id]": args.entreprise,
  });
  if (session.customer !== args.customer) throw new Error("Checkout n'a pas réutilisé le client");
  await appel("POST", `checkout/sessions/${session.id}/expire`);
  journal.push(`4. ${session.id} même client, sans essai, expirée`);
  return journal;
}

async function main() {
  const args = analyserArguments(process.argv.slice(2));
  const autorisation = autoriserExecution(args, process.env);
  console.log("Scénario Stripe Test — réabonnement :\n" + PLAN.map((l) => `  ${l}`).join("\n"));
  if (!autorisation.ok) {
    if (autorisation.motif !== "plan_seul") {
      console.error(`Refus avant tout appel réseau : ${autorisation.motif}`);
      process.exit(2);
    }
    console.log("\nPlan seul (aucun appel réseau). SQL de contrôle :\n" + sqlVerification(args.entreprise ?? "<entreprise>"));
    return;
  }
  const journal = await executer(args, process.env);
  console.log(journal.join("\n"));
  console.log("\nSQL de contrôle (Preview, après réception des webhooks) :\n" + sqlVerification(args.entreprise));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((erreur) => { console.error(erreur.message); process.exit(1); });
}
