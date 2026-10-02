// Crée (ou retrouve) le catalogue Gestion Pro dans Stripe TEST, de façon idempotente :
// - un Product par offre ;
// - deux Prices par offre (mensuel, annuel = 10 mois), retrouvés par lookup_key et
//   portant les métadonnées liria_offre / liria_periodicite / liria_version_tarif ;
// - une configuration de portail client (upgrade/downgrade entre ces Prices avec
//   proratisation, résiliation en fin de période, mise à jour du moyen de paiement).
// Affiche ensuite les lignes d'environnement à copier (identifiants publics, aucun secret).
//
// Refuse toute clé autre que sk_test_/rk_test_. Ne modifie jamais un Price existant :
// un Price Stripe est immuable, un changement de grille crée un nouveau lookup_key.
//
// Usage : node --env-file=.env.qualification scripts/stripe-test/catalogue.mjs

import { exigerCleTest, MOIS_FACTURES_PAR_AN, OFFRES, stripe, variablePrix, VERSION_GRILLE } from "./commun.mjs";

exigerCleTest();

const lignesEnv = [];
const produitsPortail = [];

for (const offre of OFFRES) {
  const lookupMensuel = `gestion_pro_${offre.cle}_mensuel_${VERSION_GRILLE}`;
  const lookupAnnuel = `gestion_pro_${offre.cle}_annuel_${VERSION_GRILLE}`;
  const existants = await stripe(`prices?active=true&expand[]=data.product&lookup_keys[]=${lookupMensuel}&lookup_keys[]=${lookupAnnuel}`, { methode: "GET" });
  const parCle = new Map(existants.data.map((prix) => [prix.lookup_key, prix]));

  let produitId = existants.data[0]?.product?.id;
  if (!produitId) {
    const produit = await stripe("products", {
      corps: { name: offre.nom, "metadata[liria_offre]": offre.cle, tax_code: "txcd_10103001" },
      idempotence: `catalogue-produit-${offre.cle}-${VERSION_GRILLE}`,
    });
    produitId = produit.id;
  }

  const prixIds = [];
  for (const [periodicite, lookup, montant, intervalle] of [
    ["mensuel", lookupMensuel, offre.mensuelCentimes, "month"],
    ["annuel", lookupAnnuel, offre.mensuelCentimes * MOIS_FACTURES_PAR_AN, "year"],
  ]) {
    let prix = parCle.get(lookup);
    if (prix && (prix.unit_amount !== montant || prix.recurring?.interval !== intervalle)) {
      throw new Error(`Price ${lookup} existant incohérent avec la grille (${prix.unit_amount} ≠ ${montant}) : créer une nouvelle VERSION_GRILLE`);
    }
    if (!prix) {
      prix = await stripe("prices", {
        corps: {
          product: produitId,
          currency: "eur",
          unit_amount: String(montant),
          "recurring[interval]": intervalle,
          tax_behavior: "exclusive",
          lookup_key: lookup,
          "metadata[liria_offre]": offre.cle,
          "metadata[liria_periodicite]": periodicite,
          "metadata[liria_version_tarif]": VERSION_GRILLE,
        },
        idempotence: `catalogue-prix-${lookup}`,
      });
    }
    prixIds.push(prix.id);
    lignesEnv.push(`${variablePrix(offre.cle, periodicite)}=${prix.id}`);
  }
  produitsPortail.push({ produitId, prixIds });
}

const corpsPortail = {
  "business_profile[headline]": "Gestion Pro — gestion de l'abonnement (Stripe Test)",
  "features[invoice_history][enabled]": "true",
  "features[payment_method_update][enabled]": "true",
  "features[customer_update][enabled]": "true",
  "features[customer_update][allowed_updates][]": "address",
  "features[subscription_cancel][enabled]": "true",
  "features[subscription_cancel][mode]": "at_period_end",
  "features[subscription_update][enabled]": "true",
  "features[subscription_update][proration_behavior]": "create_prorations",
  "features[subscription_update][default_allowed_updates][]": "price",
  "metadata[liria_version_tarif]": VERSION_GRILLE,
};
const parametres = new URLSearchParams(corpsPortail);
produitsPortail.forEach((produit, index) => {
  parametres.append(`features[subscription_update][products][${index}][product]`, produit.produitId);
  for (const prixId of produit.prixIds) parametres.append(`features[subscription_update][products][${index}][prices][]`, prixId);
});
const configurations = await stripe("billing_portal/configurations?active=true&limit=100", { methode: "GET" });
const configuration = configurations.data.find((item) => item.metadata?.liria_version_tarif === VERSION_GRILLE)
  ?? await stripe("billing_portal/configurations", {
    corps: parametres,
    idempotence: `catalogue-portail-${VERSION_GRILLE}`,
  });
lignesEnv.push(`STRIPE_BILLING_PORTAL_CONFIGURATION=${configuration.id}`);

console.log("# Catalogue Stripe TEST prêt. Lignes à reporter dans l'environnement de qualification :");
for (const ligne of lignesEnv) console.log(ligne);
