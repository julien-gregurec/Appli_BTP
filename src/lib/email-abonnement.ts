import { euros } from "@/lib/devis";
import { offreTarifaireParCle } from "@/lib/tarification";
import { MARQUE } from "@/lib/brand";

// Emails métier ELSATIA → entreprise cliente (abonnement), à distinguer des
// emails entreprise cliente → ses propres clients (devis/factures/relances,
// `src/lib/email.ts`). Fonctions PURES : aucun envoi, aucun accès réseau, aucune
// lecture d'environnement — testables sans Brevo ni Stripe.

export type ContenuEmail = { sujet: string; texte: string; html: string };

function paragraphesHtml(texte: string, bouton?: { libelle: string; lien: string } | null) {
  const corps = texte
    .split("\n\n")
    .map((bloc) => `<p style="margin:0 0 12px;">${bloc.split("\n").join("<br>")}</p>`)
    .join("");
  const action = bouton
    ? `<p style="margin:20px 0;"><a href="${bouton.lien}" style="display:inline-block;background:#0d1b2a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">${bouton.libelle}</a></p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px;">${corps}${action}</div>`;
}

function dateLisible(instantIso: string | null | undefined) {
  if (!instantIso) return null;
  const date = new Date(instantIso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

// Un paiement d'abonnement a échoué côté Stripe (`invoice.payment_failed`).
//
// Périmètre volontairement étroit :
// - aucune donnée bancaire (Stripe ne nous en transmet pas, et on n'en affiche
//   aucune : ni marque de carte, ni 4 derniers chiffres, ni motif d'échec brut) ;
// - aucun délai de suspension annoncé — la politique de relance/suspension
//   n'est pas figée côté produit, et Stripe pilote ses propres relances ;
// - le lien de régularisation est la facture hébergée Stripe déjà reçue par le
//   webhook (`hosted_invoice_url`), jamais une URL reconstruite.
export function contenuEmailPaiementEchoue(opts: {
  entrepriseNom: string;
  offre?: string | null;
  periodicite?: string | null;
  montantTtc?: number | null;
  devise?: string | null;
  dateEvenementIso?: string | null;
  numeroFacture?: string | null;
  lienFacture?: string | null;
  emailSupport?: string | null;
}): ContenuEmail {
  const offre = opts.offre ? offreTarifaireParCle(opts.offre).nom : null;
  const periodicite = opts.periodicite === "annuel" ? "annuel" : opts.periodicite === "mensuel" ? "mensuel" : null;
  const date = dateLisible(opts.dateEvenementIso);
  const montant =
    typeof opts.montantTtc === "number" && Number.isFinite(opts.montantTtc) && opts.montantTtc > 0
      ? (opts.devise ?? "EUR").toUpperCase() === "EUR"
        ? `${euros(opts.montantTtc)} TTC`
        : `${opts.montantTtc.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${(opts.devise ?? "EUR").toUpperCase()} TTC`
      : null;

  const recapitulatif = [
    `Entreprise : ${opts.entrepriseNom}`,
    offre ? `Offre : ${offre}${periodicite ? ` (${periodicite})` : ""}` : null,
    opts.numeroFacture ? `Facture : ${opts.numeroFacture}` : null,
    montant ? `Montant : ${montant}` : null,
    date ? `Date : ${date}` : null,
    "Statut : paiement non abouti",
  ].filter((ligne): ligne is string => ligne !== null);

  const texte = [
    "Bonjour,",
    "",
    `Le paiement de votre abonnement ${MARQUE} n'a pas pu être encaissé.`,
    "",
    recapitulatif.join("\n"),
    "",
    opts.lienFacture
      ? "Vous pouvez régulariser directement depuis la facture sécurisée ci-dessous. Aucune donnée bancaire ne transite par nos serveurs : le paiement est traité par notre prestataire Stripe."
      : "Nous vous invitons à vérifier le moyen de paiement enregistré. Aucune donnée bancaire ne transite par nos serveurs : le paiement est traité par notre prestataire Stripe.",
    "",
    opts.emailSupport
      ? `Si ce message vous semble inattendu, ou si vous avez besoin d'aide, écrivez-nous à ${opts.emailSupport}.`
      : "Si ce message vous semble inattendu, ou si vous avez besoin d'aide, contactez le support.",
    "",
    "Cordialement,",
    `L'équipe ${MARQUE}`,
  ].join("\n");

  return {
    sujet: `Paiement de votre abonnement ${MARQUE} — action requise`,
    texte,
    html: paragraphesHtml(texte, opts.lienFacture ? { libelle: "Régulariser le paiement", lien: opts.lienFacture } : null),
  };
}
