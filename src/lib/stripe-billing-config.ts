import { variablesStripeBillingManquantes } from "@/lib/stripe-abonnement";

// Garde-fous de commercialisation Stripe Billing (abonnements payés à Liria).
//
// Aucun de ces contrôles ne lit ni n'affiche la valeur d'un secret : seul le
// préfixe public de la clé (`sk_test_`, `sk_live_`…) sert à déterminer le mode.
// Toute absence de configuration ferme la souscription : on ne vend jamais par
// défaut.

export type ModeStripe = "test" | "live" | "absent" | "inconnu";

export function modeStripe(environnement: NodeJS.ProcessEnv = process.env): ModeStripe {
  const cle = environnement.STRIPE_SECRET_KEY;
  if (!cle) return "absent";
  if (/^(sk|rk)_test_/.test(cle)) return "test";
  if (/^(sk|rk)_live_/.test(cle)) return "live";
  return "inconnu";
}

export const REGIMES_TVA = ["franchise_en_base", "assujetti"] as const;
export type RegimeTva = (typeof REGIMES_TVA)[number];

export const MENTION_FRANCHISE_TVA = "TVA non applicable, art. 293 B du CGI";
export const MENTION_DOCUMENT_TEST = "Stripe Test : document sans valeur comptable ni fiscale.";

export function regimeTva(environnement: NodeJS.ProcessEnv = process.env) {
  const brut = environnement.LIRIA_TVA_REGIME ?? "";
  const regime = (REGIMES_TVA as readonly string[]).includes(brut) ? (brut as RegimeTva) : null;
  // Le régime n'est jamais déduit : il doit être déclaré ET confirmé
  // explicitement (validation expert-comptable).
  return { regime, confirme: regime !== null && environnement.LIRIA_TVA_REGIME_CONFIRME === "true" };
}

const FORMES_SOCIETE = new Set(["SAS", "SASU", "SARL", "EURL", "SA", "SNC", "SCOP"]);

function sirenValide(valeur: string) {
  const chiffres = valeur.replace(/\s/g, "");
  if (!/^\d{9}(\d{5})?$/.test(chiffres)) return false;
  // Clé de Luhn sur le SIREN (9 premiers chiffres).
  let somme = 0;
  for (let i = 0; i < 9; i += 1) {
    let chiffre = Number(chiffres[8 - i]);
    if (i % 2 === 1) {
      chiffre *= 2;
      if (chiffre > 9) chiffre -= 9;
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}

// Mentions minimales d'une facture B2B française (CGI ann. II art. 242 nonies A,
// C. com. L441-9). Les valeurs ne sont pas des secrets mais ne sont jamais
// inventées : elles proviennent de la configuration de l'environnement.
export function champsIdentiteVendeurManquants(environnement: NodeJS.ProcessEnv = process.env) {
  const manquants: string[] = [];
  const exiger = (nom: string) => {
    if (!environnement[nom]?.trim()) manquants.push(nom);
  };
  exiger("LIRIA_VENDEUR_DENOMINATION");
  exiger("LIRIA_VENDEUR_FORME_JURIDIQUE");
  exiger("LIRIA_VENDEUR_ADRESSE");
  exiger("LIRIA_VENDEUR_EMAIL");
  exiger("LIRIA_FACTURE_MENTIONS_PAIEMENT");
  const siren = environnement.LIRIA_VENDEUR_SIREN?.trim();
  if (!siren || !sirenValide(siren)) manquants.push("LIRIA_VENDEUR_SIREN");
  const forme = environnement.LIRIA_VENDEUR_FORME_JURIDIQUE?.trim().toUpperCase() ?? "";
  if (FORMES_SOCIETE.has(forme)) {
    exiger("LIRIA_VENDEUR_RCS");
    exiger("LIRIA_VENDEUR_CAPITAL");
  }
  if (regimeTva(environnement).regime === "assujetti") exiger("LIRIA_VENDEUR_TVA_INTRA");
  // Stripe émet le PDF de facture à partir des informations publiques du compte :
  // une personne doit avoir vérifié qu'elles correspondent à l'identité ci-dessus.
  if (environnement.LIRIA_VENDEUR_IDENTITE_STRIPE_VERIFIEE !== "true") manquants.push("LIRIA_VENDEUR_IDENTITE_STRIPE_VERIFIEE");
  return manquants;
}

export function facturationReelleAutorisee(environnement: NodeJS.ProcessEnv = process.env) {
  return champsIdentiteVendeurManquants(environnement).length === 0 && regimeTva(environnement).confirme;
}

export type EtatOuverture = { ouvert: boolean; mode: ModeStripe; raisons: string[] };

// Règle d'ouverture commerciale :
// - Stripe Test : ouvert uniquement si STRIPE_BILLING_QUALIFICATION_TEST=true
//   (environnement de qualification explicite, aucun débit réel possible) ;
// - Stripe Live : décision explicite (STRIPE_BILLING_LIVE_AUTORISE=true) ET date
//   d'ouverture atteinte ET identité vendeur complète ET régime TVA confirmé ;
// - toute autre situation : fermé.
export function etatOuvertureCommerciale(
  environnement: NodeJS.ProcessEnv = process.env,
  maintenant: Date = new Date(),
): EtatOuverture {
  const mode = modeStripe(environnement);
  const raisons: string[] = [];
  if (mode === "absent") raisons.push("clé Stripe absente");
  if (mode === "inconnu") raisons.push("clé Stripe de format inconnu");
  const manquantes = variablesStripeBillingManquantes(environnement);
  if (manquantes.length) raisons.push(`configuration Stripe incomplète (${manquantes.join(", ")})`);

  if (mode === "test" && environnement.STRIPE_BILLING_QUALIFICATION_TEST !== "true") {
    raisons.push("qualification Stripe Test non activée (STRIPE_BILLING_QUALIFICATION_TEST)");
  }
  if (mode === "live") {
    if (environnement.STRIPE_BILLING_LIVE_AUTORISE !== "true") raisons.push("aucune décision explicite d’ouverture Live (STRIPE_BILLING_LIVE_AUTORISE)");
    const brut = environnement.ABONNEMENTS_OUVERTURE_COMMERCIALE_AT;
    const date = brut ? new Date(brut) : null;
    if (!date || Number.isNaN(date.getTime())) raisons.push("date d’ouverture commerciale absente ou invalide (ABONNEMENTS_OUVERTURE_COMMERCIALE_AT)");
    else if (date.getTime() > maintenant.getTime()) raisons.push(`ouverture commerciale prévue le ${date.toISOString()}`);
    const identite = champsIdentiteVendeurManquants(environnement);
    if (identite.length) raisons.push(`identité vendeur incomplète (${identite.join(", ")})`);
    if (!regimeTva(environnement).confirme) raisons.push("régime de TVA non confirmé (LIRIA_TVA_REGIME, LIRIA_TVA_REGIME_CONFIRME)");
  }
  return { ouvert: raisons.length === 0 && (mode === "test" || mode === "live"), mode, raisons };
}

// Paramètres fiscaux ajoutés à la session Checkout. Le régime n'est appliqué que
// s'il est déclaré ; en son absence, aucune taxe n'est calculée et la facturation
// réelle reste fermée par `etatOuvertureCommerciale`.
export function parametresFiscauxCheckout(environnement: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const parametres: Record<string, string> = {
    billing_address_collection: "required",
    "customer_update[address]": "auto",
    "customer_update[name]": "auto",
  };
  if (regimeTva(environnement).regime === "assujetti") {
    parametres["automatic_tax[enabled]"] = "true";
    parametres["tax_id_collection[enabled]"] = "true";
  }
  return parametres;
}

// Pied de facture posé sur le client Stripe : identité vendeur, mention TVA et
// conditions de paiement. En mode Test, la mention « sans valeur » est ajoutée.
export function piedDeFactureStripe(environnement: NodeJS.ProcessEnv = process.env) {
  const lignes: string[] = [];
  if (modeStripe(environnement) !== "live") lignes.push(MENTION_DOCUMENT_TEST);
  const identite = [
    environnement.LIRIA_VENDEUR_DENOMINATION,
    environnement.LIRIA_VENDEUR_FORME_JURIDIQUE,
    environnement.LIRIA_VENDEUR_CAPITAL ? `capital ${environnement.LIRIA_VENDEUR_CAPITAL}` : null,
    environnement.LIRIA_VENDEUR_ADRESSE,
    environnement.LIRIA_VENDEUR_SIREN ? `SIREN/SIRET ${environnement.LIRIA_VENDEUR_SIREN}` : null,
    environnement.LIRIA_VENDEUR_RCS,
    environnement.LIRIA_VENDEUR_TVA_INTRA ? `TVA ${environnement.LIRIA_VENDEUR_TVA_INTRA}` : null,
  ].filter(Boolean);
  if (identite.length) lignes.push(identite.join(" · "));
  const { regime } = regimeTva(environnement);
  if (regime === "franchise_en_base") lignes.push(MENTION_FRANCHISE_TVA);
  if (environnement.LIRIA_FACTURE_MENTIONS_PAIEMENT) lignes.push(environnement.LIRIA_FACTURE_MENTIONS_PAIEMENT);
  // Limite Stripe du pied de facture : 5 000 caractères.
  return lignes.join("\n").slice(0, 5000);
}
