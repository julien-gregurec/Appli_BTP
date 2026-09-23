// Étape MANUELLE (REMOTE STRIPE) — jamais exécutée en CI ni par une IA sans
// clé réelle : crée une Configuration de Portail Stripe explicite, limitée aux
// offres commercialisées, puis affiche l'id à coller dans
// STRIPE_PORTAL_CONFIGURATION_ID (Vercel). Autonome (pas d'import TS) pour
// rester exécutable avec `node` seul.
//
// Reflète OFFRES_ABONNEMENT_COMMERCIALISEES / VARIABLES_PRIX de
// src/lib/stripe-abonnement.ts — si cette liste change côté app, la mettre à
// jour ici aussi (voir aussi creerConfigurationPortailAbonnement, la version
// testée/mockée de cette même logique).
//
// Usage : STRIPE_SECRET_KEY=sk_test_... node scripts/configurer-portail-stripe.mjs

const OFFRES_COMMERCIALISEES = ["mini", "pro", "business", "entreprise"];
const VARIABLES_PRIX = {
  mini: { mensuel: "STRIPE_PRICE_MINI_MENSUEL", annuel: "STRIPE_PRICE_MINI_ANNUEL" },
  pro: { mensuel: "STRIPE_PRICE_PRO_MENSUEL", annuel: "STRIPE_PRICE_PRO_ANNUEL" },
  business: { mensuel: "STRIPE_PRICE_BUSINESS_MENSUEL", annuel: "STRIPE_PRICE_BUSINESS_ANNUEL" },
  entreprise: { mensuel: "STRIPE_PRICE_ENTREPRISE_MENSUEL", annuel: "STRIPE_PRICE_ENTREPRISE_ANNUEL" },
};

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error("STRIPE_SECRET_KEY manquante : lancer avec STRIPE_SECRET_KEY=sk_test_... (jamais une clé live sans validation).");
  process.exit(1);
}

async function stripe(chemin, { methode = "POST", corps } = {}) {
  const reponse = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(corps ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: corps,
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(donnees.error?.message || `Stripe a refusé ${methode} ${chemin}`);
  return donnees;
}

const produits = new Map();
for (const offre of OFFRES_COMMERCIALISEES) {
  const variables = VARIABLES_PRIX[offre];
  const prixOffre = [process.env[variables.mensuel], process.env[variables.annuel]].filter(Boolean);
  if (!prixOffre.length) {
    console.warn(`Aucun prix configuré pour l'offre "${offre}" (${variables.mensuel}/${variables.annuel}) — ignorée.`);
    continue;
  }
  const { product } = await stripe(`prices/${encodeURIComponent(prixOffre[0])}`, { methode: "GET" });
  const productId = typeof product === "string" ? product : product.id;
  if (!produits.has(productId)) produits.set(productId, new Set());
  for (const prix of prixOffre) produits.get(productId).add(prix);
}
if (!produits.size) {
  console.error("Aucun prix d'abonnement commercialisé n'est configuré (variables STRIPE_PRICE_* manquantes).");
  process.exit(1);
}

const corps = new URLSearchParams({
  "features[subscription_update][enabled]": "true",
  "features[subscription_update][default_allowed_updates][0]": "price",
  "features[subscription_update][proration_behavior]": "create_prorations",
  "features[invoice_history][enabled]": "true",
  "features[payment_method_update][enabled]": "true",
  "features[subscription_cancel][enabled]": "true",
  "features[subscription_cancel][mode]": "at_period_end",
  "features[subscription_cancel][cancellation_reason][enabled]": "true",
});
let indexProduit = 0;
for (const [product, prix] of produits) {
  corps.set(`features[subscription_update][products][${indexProduit}][product]`, product);
  let indexPrix = 0;
  for (const prixId of prix) {
    corps.set(`features[subscription_update][products][${indexProduit}][prices][${indexPrix}]`, prixId);
    indexPrix += 1;
  }
  indexProduit += 1;
}

const configuration = await stripe("billing_portal/configurations", { corps });
console.log(`Configuration du Portail créée : ${configuration.id}`);
console.log("Copier cette valeur dans la variable d'environnement STRIPE_PORTAL_CONFIGURATION_ID (Vercel).");
