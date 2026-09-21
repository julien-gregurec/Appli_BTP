import "server-only";
import { brevoEstConfigure, envoyerEmailBrevo } from "@/lib/brevo";
import { contenuEmailPaiementEchoue } from "@/lib/email-abonnement";
import { creerConfigurationMarqueServeur } from "@/lib/brand";

// Notifications ELSATIA → entreprise cliente déclenchées par le webhook
// abonnement Stripe. Best-effort par construction : le webhook Stripe ne doit
// JAMAIS échouer (ni être rejoué) à cause d'un envoi d'email. Toute erreur est
// avalée ici et renvoyée sous forme de motif, jamais propagée.

export type ResultatNotification =
  | { envoye: true }
  | { envoye: false; motif: "brevo_non_configure" | "destinataire_absent" | "envoi_impossible" };

export async function notifierPaiementAbonnementEchoue(params: {
  destinataire: string | null | undefined;
  entrepriseNom: string;
  offre?: string | null;
  periodicite?: string | null;
  montantTtc?: number | null;
  devise?: string | null;
  dateEvenementIso?: string | null;
  numeroFacture?: string | null;
  lienFacture?: string | null;
}): Promise<ResultatNotification> {
  const destinataire = params.destinataire?.trim();
  if (!destinataire) return { envoye: false, motif: "destinataire_absent" };
  if (!brevoEstConfigure()) return { envoye: false, motif: "brevo_non_configure" };

  const support = creerConfigurationMarqueServeur(process.env).supportEmail;
  const contenu = contenuEmailPaiementEchoue({
    entrepriseNom: params.entrepriseNom,
    offre: params.offre,
    periodicite: params.periodicite,
    montantTtc: params.montantTtc,
    devise: params.devise,
    dateEvenementIso: params.dateEvenementIso,
    numeroFacture: params.numeroFacture,
    lienFacture: params.lienFacture,
    emailSupport: support,
  });

  try {
    await envoyerEmailBrevo({
      to: destinataire,
      sujet: contenu.sujet,
      texte: contenu.texte,
      html: contenu.html,
      replyTo: support,
    });
    return { envoye: true };
  } catch {
    // Jamais l'adresse du destinataire ni le corps de la réponse Brevo en clair.
    console.warn("Notification paiement échoué non envoyée", { categorie: "envoi_impossible" });
    return { envoye: false, motif: "envoi_impossible" };
  }
}
