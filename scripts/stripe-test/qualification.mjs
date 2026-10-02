// Qualification Stripe TEST bout-en-bout avec Test Clock.
//
// Prérequis (voir docs/qualification/ELSATIA_STRIPE_TEST_COMMERCIALIZATION_READINESS_V1.md) :
// - application lancée sur une base de QUALIFICATION (jamais la production) ;
// - webhook Stripe Test acheminé vers /api/stripe/abonnement/webhook
//   (ex. `stripe listen --forward-to localhost:3000/api/stripe/abonnement/webhook`) ;
// - une entreprise de qualification existante (STRIPE_QUALIF_ENTREPRISE_ID) ;
// - catalogue Test créé par scripts/stripe-test/catalogue.mjs.
//
// Chaque étape agit sur Stripe Test puis attend que le webhook ait produit l'état
// attendu en base (droits Gestion Pro). Les rejeux (doublon, ordre inversé,
// invoice.paid tardif) sont des événements Stripe réels, re-signés et renvoyés.
//
// Usage :
//   node --env-file=.env.qualification scripts/stripe-test/qualification.mjs --plan
//   node --env-file=.env.qualification scripts/stripe-test/qualification.mjs

import { createHmac } from "node:crypto";
import { exigerCleTest, stripe } from "./commun.mjs";

const ETAPES = [
  "souscription avec essai → essai / pro",
  "Test Clock +31 j : premier paiement réussi → actif",
  "portail : session créée avec la configuration versionnée",
  "upgrade Pro → Business (proratisation) → offre business",
  "downgrade Business → Mini → offre mini",
  "résiliation en fin de période → annulation programmée, toujours actif",
  "rejeu d'un webhook déjà traité → doublon sans effet",
  "résiliation terminale → annule",
  "ordre inversé : ancien customer.subscription.updated (actif) rejoué → reste annule",
  "invoice.paid tardif rejoué → reste annule",
  "réabonnement sans nouvel essai → actif sur le nouvel abonnement",
  "paiement refusé au renouvellement → suspendu",
  "régularisation du paiement → restauration actif",
  "cron de réconciliation (webhook manquant) → état confirmé",
];

if (process.argv.includes("--plan")) {
  ETAPES.forEach((etape, index) => console.log(`${String(index + 1).padStart(2, "0")}. ${etape}`));
  process.exit(0);
}

exigerCleTest();
const requises = [
  "STRIPE_WEBHOOK_ABONNEMENT_SECRET", "NEXT_PUBLIC_APP_URL", "CRON_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_QUALIF_ENTREPRISE_ID",
  "STRIPE_PRICE_PRO_MENSUEL", "STRIPE_PRICE_BUSINESS_MENSUEL", "STRIPE_PRICE_MINI_MENSUEL",
];
const absentes = requises.filter((nom) => !process.env[nom]);
if (absentes.length) {
  console.error(`BLOCKED_EXTERNAL : variables absentes : ${absentes.join(", ")}`);
  process.exit(2);
}
if (process.env.STRIPE_QUALIF_BASE_NON_PRODUCTION !== "true") {
  console.error("REFUS : confirmez que la base Supabase visée n'est pas la production (STRIPE_QUALIF_BASE_NON_PRODUCTION=true).");
  process.exit(1);
}

const ENTREPRISE = process.env.STRIPE_QUALIF_ENTREPRISE_ID;
const APP = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
const WEBHOOK = process.env.STRIPE_QUALIF_WEBHOOK_URL ?? `${APP}/api/stripe/abonnement/webhook`;
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const enTetesSupabase = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};
const resultats = [];
const pause = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));

async function lireEntreprise() {
  const reponse = await fetch(`${SUPABASE}/rest/v1/entreprises?id=eq.${ENTREPRISE}&select=abonnement_statut,abonnement_offre,abonnement_periodicite,stripe_subscription_id,stripe_customer_id,abonnement_annulation_prevue_at`, { headers: enTetesSupabase });
  if (!reponse.ok) throw new Error(`Lecture Supabase impossible (${reponse.status})`);
  const [ligne] = await reponse.json();
  if (!ligne) throw new Error("Entreprise de qualification introuvable");
  return ligne;
}

async function ecrireEntreprise(champs) {
  const reponse = await fetch(`${SUPABASE}/rest/v1/entreprises?id=eq.${ENTREPRISE}`, { method: "PATCH", headers: enTetesSupabase, body: JSON.stringify(champs) });
  if (!reponse.ok) throw new Error(`Écriture Supabase impossible (${reponse.status})`);
}

async function attendre(etape, attendu, delaiMs = 90_000) {
  const debut = Date.now();
  let dernier = null;
  while (Date.now() - debut < delaiMs) {
    dernier = await lireEntreprise();
    if (Object.entries(attendu).every(([cle, valeur]) => (typeof valeur === "function" ? valeur(dernier[cle]) : dernier[cle] === valeur))) {
      resultats.push({ etape, ok: true, etat: dernier });
      console.log(`✓ ${etape}`);
      return dernier;
    }
    await pause(2_000);
  }
  resultats.push({ etape, ok: false, etat: dernier, attendu: Object.fromEntries(Object.entries(attendu).map(([cle, valeur]) => [cle, typeof valeur === "function" ? "prédicat" : valeur])) });
  console.log(`✗ ${etape} (état observé : ${JSON.stringify(dernier)})`);
  return dernier;
}

async function avancerHorloge(horloge, secondes) {
  const cible = horloge.frozen_time + secondes;
  await stripe(`test_helpers/test_clocks/${horloge.id}/advance`, { corps: { frozen_time: String(cible) } });
  for (let essai = 0; essai < 90; essai += 1) {
    const etat = await stripe(`test_helpers/test_clocks/${horloge.id}`, { methode: "GET" });
    if (etat.status === "ready") return etat;
    await pause(2_000);
  }
  throw new Error("Test Clock bloquée en avance");
}

// Renvoie un événement Stripe réel, re-signé avec le secret du webhook.
async function rejouer(evenement, nouvelId) {
  const corps = JSON.stringify(nouvelId ? { ...evenement, id: nouvelId } : evenement);
  const horodatage = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_ABONNEMENT_SECRET).update(`${horodatage}.${corps}`).digest("hex");
  const reponse = await fetch(WEBHOOK, { method: "POST", headers: { "stripe-signature": `t=${horodatage},v1=${signature}`, "Content-Type": "application/json" }, body: corps });
  return { statut: reponse.status, corps: await reponse.json().catch(() => ({})) };
}

async function evenements(type, predicat) {
  const liste = await stripe(`events?type=${type}&limit=100`, { methode: "GET" });
  return liste.data.filter(predicat).sort((a, b) => a.created - b.created);
}

async function attacherCarte(client, jeton) {
  const moyen = await stripe(`payment_methods/${jeton}/attach`, { corps: { customer: client } });
  await stripe(`customers/${client}`, { corps: { "invoice_settings[default_payment_method]": moyen.id } });
  return moyen.id;
}

let horloge = null;
try {
  horloge = await stripe("test_helpers/test_clocks", { corps: { frozen_time: String(Math.floor(Date.now() / 1000)), name: `Qualification Gestion Pro ${new Date().toISOString()}` } });
  const client = await stripe("customers", { corps: { test_clock: horloge.id, name: "Qualification Gestion Pro", email: "qualification@example.test", "metadata[entreprise_id]": ENTREPRISE } });
  await attacherCarte(client.id, "pm_card_visa");
  await ecrireEntreprise({ stripe_customer_id: client.id, stripe_subscription_id: null, abonnement_statut: "essai" });

  // 1. Souscription avec essai (mêmes paramètres et métadonnées que le Checkout).
  const abonnement = await stripe("subscriptions", { corps: {
    customer: client.id,
    "items[0][price]": process.env.STRIPE_PRICE_PRO_MENSUEL,
    trial_period_days: "30",
    "metadata[entreprise_id]": ENTREPRISE, "metadata[offre]": "pro", "metadata[periodicite]": "mensuel",
  } });
  await attendre(ETAPES[0], { abonnement_statut: "essai", abonnement_offre: "pro", stripe_subscription_id: abonnement.id });

  // 2. Fin d'essai et premier paiement.
  horloge = await avancerHorloge(horloge, 31 * 86_400);
  await attendre(ETAPES[1], { abonnement_statut: "actif" });

  // 3. Portail client.
  const portail = await stripe("billing_portal/sessions", { corps: {
    customer: client.id, return_url: `${APP}/abonnement`,
    ...(process.env.STRIPE_BILLING_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_BILLING_PORTAL_CONFIGURATION } : {}),
  } });
  resultats.push({ etape: ETAPES[2], ok: Boolean(portail.url), manuel: "Ouvrir l'URL du portail et rejouer upgrade/downgrade à la main pour valider l'interface." });
  console.log(`${portail.url ? "✓" : "✗"} ${ETAPES[2]}`);

  // 4-5. Upgrade puis downgrade : même opération que le portail (changement de Price).
  const ligne = abonnement.items.data[0].id;
  await stripe(`subscriptions/${abonnement.id}`, { corps: { "items[0][id]": ligne, "items[0][price]": process.env.STRIPE_PRICE_BUSINESS_MENSUEL, proration_behavior: "create_prorations" } });
  await attendre(ETAPES[3], { abonnement_offre: "business" });
  await stripe(`subscriptions/${abonnement.id}`, { corps: { "items[0][id]": ligne, "items[0][price]": process.env.STRIPE_PRICE_MINI_MENSUEL, proration_behavior: "create_prorations" } });
  await attendre(ETAPES[4], { abonnement_offre: "mini" });

  // 6. Résiliation en fin de période.
  await stripe(`subscriptions/${abonnement.id}`, { corps: { cancel_at_period_end: "true" } });
  await attendre(ETAPES[5], { abonnement_statut: "actif", abonnement_annulation_prevue_at: (valeur) => Boolean(valeur) });

  // 7. Doublon : un événement déjà traité, renvoyé tel quel.
  const misesAJour = await evenements("customer.subscription.updated", (evt) => evt.data.object.id === abonnement.id);
  const doublon = await rejouer(misesAJour.at(-1));
  resultats.push({ etape: ETAPES[6], ok: doublon.statut === 200 && doublon.corps.duplicate === true, reponse: doublon });
  console.log(`${doublon.corps.duplicate === true ? "✓" : "✗"} ${ETAPES[6]}`);

  // 8. Résiliation terminale.
  await stripe(`subscriptions/${abonnement.id}`, { methode: "DELETE" });
  await attendre(ETAPES[7], { abonnement_statut: "annule" });

  // 9. Ordre inversé : le plus ancien « updated » encore actif, rejoué sous un nouvel id.
  const ancienActif = misesAJour.find((evt) => evt.data.object.status === "active");
  if (ancienActif) {
    const reponse = await rejouer(ancienActif, `${ancienActif.id}_rejeu_inverse_${Date.now()}`);
    const etat = await lireEntreprise();
    const ok = reponse.statut === 200 && etat.abonnement_statut === "annule";
    resultats.push({ etape: ETAPES[8], ok, reponse, etat });
    console.log(`${ok ? "✓" : "✗"} ${ETAPES[8]}`);
  }

  // 10. invoice.paid tardif.
  const [facturePayee] = await evenements("invoice.paid", (evt) => evt.data.object.customer === client.id);
  if (facturePayee) {
    const reponse = await rejouer(facturePayee, `${facturePayee.id}_tardif_${Date.now()}`);
    const etat = await lireEntreprise();
    const ok = reponse.statut === 200 && etat.abonnement_statut === "annule";
    resultats.push({ etape: ETAPES[9], ok, reponse, etat });
    console.log(`${ok ? "✓" : "✗"} ${ETAPES[9]}`);
  }

  // 11. Réabonnement (sans essai, comme le Checkout d'une réactivation).
  const reabonnement = await stripe("subscriptions", { corps: {
    customer: client.id,
    "items[0][price]": process.env.STRIPE_PRICE_PRO_MENSUEL,
    "metadata[entreprise_id]": ENTREPRISE, "metadata[offre]": "pro", "metadata[periodicite]": "mensuel",
  } });
  await attendre(ETAPES[10], { abonnement_statut: "actif", stripe_subscription_id: reabonnement.id, abonnement_offre: "pro" });

  // 12. Paiement refusé au renouvellement.
  await attacherCarte(client.id, "pm_card_chargeCustomerFail");
  await stripe(`subscriptions/${reabonnement.id}`, { corps: { default_payment_method: (await stripe(`customers/${client.id}`, { methode: "GET" })).invoice_settings.default_payment_method } });
  horloge = await avancerHorloge(horloge, 32 * 86_400);
  await attendre(ETAPES[11], { abonnement_statut: "suspendu" });

  // 13. Restauration : carte valide et paiement de la facture ouverte.
  const carteValide = await attacherCarte(client.id, "pm_card_visa");
  await stripe(`subscriptions/${reabonnement.id}`, { corps: { default_payment_method: carteValide } });
  const ouvertes = await stripe(`invoices?subscription=${reabonnement.id}&status=open`, { methode: "GET" });
  for (const facture of ouvertes.data) await stripe(`invoices/${facture.id}/pay`, { corps: { payment_method: carteValide } });
  await attendre(ETAPES[12], { abonnement_statut: "actif" });

  // 14. Réconciliation (filet contre un webhook manquant).
  const cron = await fetch(`${APP}/api/cron/abonnements`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const rapport = await cron.json().catch(() => ({}));
  const ligneCron = (rapport.statutsStripe ?? []).find((ligne) => ligne.entrepriseId === ENTREPRISE);
  const okCron = cron.ok && ligneCron?.ok === true && ligneCron?.statut === "actif";
  resultats.push({ etape: ETAPES[13], ok: okCron, rapport: ligneCron ?? null });
  console.log(`${okCron ? "✓" : "✗"} ${ETAPES[13]}`);
} catch (erreur) {
  resultats.push({ etape: "exécution", ok: false, erreur: erreur instanceof Error ? erreur.message : String(erreur) });
  console.error(`✗ Arrêt : ${erreur instanceof Error ? erreur.message : erreur}`);
} finally {
  // La suppression de la Test Clock supprime aussi le client et ses abonnements Test.
  if (horloge) await stripe(`test_helpers/test_clocks/${horloge.id}`, { methode: "DELETE" }).catch(() => null);
}

const echecs = resultats.filter((resultat) => !resultat.ok);
console.log(JSON.stringify({ date: new Date().toISOString(), verdict: echecs.length ? "ECHEC" : "QUALIFIE", resultats }, null, 2));
process.exit(echecs.length ? 1 : 0);
