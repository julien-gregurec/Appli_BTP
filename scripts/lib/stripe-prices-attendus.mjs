// ELSATIA — dérive, depuis le SEUL contrat canonique, ce que Stripe doit porter.
//
// Aucun montant n'est écrit ici : tout vient de src/lib/tarification.canonical.json.
// Partagé par `scripts/verify-stripe-prices.mjs` (garde-fou) et par les tests,
// pour qu'une seule définition fasse foi.

/** Un Price attendu : quelle variable d'environnement, quel montant, quelle facturation. */
function ligne({ cle, famille, libelle, nomVar, billingKind, interval, centimes }) {
  return { cle, famille, libelle, nomVar, billingKind, interval, centimes };
}

function recurrent({ cle, famille, libelle, prefixeVar, mensuelCentimes, annuelCentimes }) {
  const out = [];
  if (mensuelCentimes != null)
    out.push(ligne({ cle, famille, libelle, nomVar: `${prefixeVar}_MENSUEL`, billingKind: "recurring_monthly", interval: "month", centimes: mensuelCentimes }));
  if (annuelCentimes != null)
    out.push(ligne({ cle, famille, libelle, nomVar: `${prefixeVar}_ANNUEL`, billingKind: "recurring_yearly", interval: "year", centimes: annuelCentimes }));
  return out;
}

/**
 * Tous les Price que la génération courante doit porter dans Stripe.
 * Un rôle gratuit (expert-comptable) n'en produit aucun : voir `offresSansPriceStripe`.
 */
export function construireAttendus(catalogue) {
  const attendus = [];

  for (const o of catalogue.offres) {
    attendus.push(...recurrent({
      cle: `forfait_${o.cle}`, famille: "forfait", libelle: o.nom,
      prefixeVar: `STRIPE_PRICE_${o.cle.toUpperCase()}`,
      mensuelCentimes: o.mensuelCentimes, annuelCentimes: o.annuelCentimes,
    }));
  }

  for (const r of catalogue.comptesSupplementaires.generationCourante.roles) {
    if (r.mensuelCentimes === 0) continue; // gratuit : jamais facturé, donc jamais dans Stripe
    attendus.push(...recurrent({
      cle: `compte_sup_${r.cle}`, famille: "compte_supplementaire", libelle: r.nom,
      prefixeVar: `STRIPE_PRICE_COMPTE_SUP_ROLE_${r.cle.toUpperCase()}`,
      mensuelCentimes: r.mensuelCentimes, annuelCentimes: r.mensuelCentimes * 10,
    }));
  }

  for (const m of catalogue.modules) {
    attendus.push(...recurrent({
      cle: `module_${m.cle}`, famille: "module", libelle: m.nom,
      prefixeVar: `STRIPE_PRICE_MODULE_${m.cle.toUpperCase()}`,
      mensuelCentimes: m.mensuelCentimes, annuelCentimes: m.annuelCentimes,
    }));
  }

  // Pack de crédits IA : achat ponctuel. Pas d'intervalle, pas de tarif annuel.
  const pack = catalogue.optionsIA.packCredits;
  attendus.push(ligne({
    cle: "ia_credits_pack", famille: "ia", libelle: pack.nom,
    nomVar: "STRIPE_PRICE_IA_CREDITS_PACK_PONCTUEL",
    billingKind: "one_time", interval: null, centimes: pack.prixCentimes,
  }));

  // IA intensive : option récurrente, produit distinct du pack.
  const intensive = catalogue.optionsIA.capaciteRenforcee;
  attendus.push(...recurrent({
    cle: "ia_intensive", famille: "ia", libelle: intensive.nom,
    prefixeVar: "STRIPE_PRICE_IA_INTENSIVE",
    mensuelCentimes: intensive.mensuelCentimes, annuelCentimes: intensive.annuelCentimes,
  }));

  return attendus;
}

/**
 * Ce qui ne doit porter AUCUN Price payant : un accès gratuit ne passe pas par Stripe.
 * Le garde-fou vérifie l'absence, pas seulement la présence.
 */
export function offresSansPriceStripe(catalogue) {
  return catalogue.comptesSupplementaires.generationCourante.roles
    .filter((r) => r.mensuelCentimes === 0)
    .map((r) => ({
      cle: `compte_sup_${r.cle}`,
      libelle: r.nom,
      prefixesVarInterdits: [`STRIPE_PRICE_COMPTE_SUP_ROLE_${r.cle.toUpperCase()}`],
    }));
}

/**
 * Les couples mensuel/annuel soumis à la règle « annuel = 10 × mensuel ».
 * Le pack ponctuel en est exclu : il n'a pas de périodicité.
 */
export function couplesRegleAnnuelle(attendus) {
  const parCle = new Map();
  for (const a of attendus) {
    if (!parCle.has(a.cle)) parCle.set(a.cle, {});
    if (a.billingKind === "recurring_monthly") parCle.get(a.cle).mensuel = a.centimes;
    if (a.billingKind === "recurring_yearly") parCle.get(a.cle).annuel = a.centimes;
  }
  return [...parCle.entries()]
    .filter(([, v]) => typeof v.mensuel === "number" && typeof v.annuel === "number")
    .map(([cle, v]) => ({ cle, ...v }));
}
