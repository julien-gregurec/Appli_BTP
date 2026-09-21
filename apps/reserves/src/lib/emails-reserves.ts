import "server-only";
import {
  brevoEstConfigure, echapperHtml, envoyerEmailBrevo, gabaritEmailElsatia,
} from "@elsatia/email";

// Gabarits propres à ELSATIA Réserves. Le TRANSPORT et la charte sont ceux du socle
// (`packages/email`) : rien n'est redéfini ici, ni secret, ni mise en page.

const APPLICATION = "ELSATIA Réserves";

export type ResultatEnvoi = { envoye: boolean; motif?: string };

/**
 * Un e-mail non envoyé n'est jamais une erreur silencieuse : la fonction renvoie
 * pourquoi. L'appelant décide alors quoi montrer — pour une invitation, il affiche le
 * lien à copier, ce qui reste utilisable même sans canal e-mail configuré.
 */
async function envoyer(params: {
  to: string;
  toName?: string | null;
  sujet: string;
  texte: string;
  html: string;
}): Promise<ResultatEnvoi> {
  if (!brevoEstConfigure()) {
    return { envoye: false, motif: "Le canal e-mail ELSATIA n’est pas configuré sur cet environnement." };
  }
  try {
    await envoyerEmailBrevo(params);
    return { envoye: true };
  } catch (erreur) {
    return {
      envoye: false,
      motif: erreur instanceof Error ? erreur.message : "Envoi e-mail impossible.",
    };
  }
}

export function messageInvitation(params: {
  organisationHote: string;
  chantier: string;
  intervenant: string;
  contactNom: string | null;
  url: string;
  expireLe: Date;
}) {
  const expiration = params.expireLe.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const salutation = params.contactNom ? `Bonjour ${params.contactNom},` : "Bonjour,";
  const sujet = `Intervention sur le chantier ${params.chantier} — ${params.organisationHote}`;

  const texte = [
    salutation,
    "",
    `${params.organisationHote} vous a invité à intervenir sur le chantier « ${params.chantier} » `
      + `dans ELSATIA Réserves, sous le nom « ${params.intervenant} ».`,
    "",
    "Vous y verrez uniquement les réserves qui vous sont attribuées : ni les autres corps",
    "d’état, ni les autres chantiers, ni les données commerciales du donneur d’ordre.",
    "",
    "Lien sécurisé, personnel et à usage unique :",
    params.url,
    "",
    `Ce lien expire le ${expiration}. Passé cette date, demandez-en un nouveau à ${params.organisationHote}.`,
    "",
    "L’accès à ELSATIA Réserves en tant qu’entreprise intervenante est gratuit.",
  ].join("\n");

  const html = gabaritEmailElsatia({
    application: APPLICATION,
    titre: `Invitation à intervenir sur ${params.chantier}`,
    paragraphes: [
      echapperHtml(salutation),
      `<strong>${echapperHtml(params.organisationHote)}</strong> vous a invité à intervenir sur le chantier `
        + `<strong>${echapperHtml(params.chantier)}</strong>, sous le nom «&nbsp;${echapperHtml(params.intervenant)}&nbsp;».`,
      "Vous y verrez uniquement les réserves qui vous sont attribuées : ni les autres corps d’état, "
        + "ni les autres chantiers, ni les données commerciales du donneur d’ordre.",
    ],
    bouton: { libelle: "Rejoindre l’intervention", url: params.url },
    piedDePage: `Lien sécurisé, personnel et à usage unique. Il expire le ${echapperHtml(expiration)}. `
      + "L’accès en tant qu’entreprise intervenante est gratuit.",
  });

  return { sujet, texte, html };
}

export async function envoyerInvitation(params: {
  destinataire: string;
  organisationHote: string;
  chantier: string;
  intervenant: string;
  contactNom: string | null;
  url: string;
  expireLe: Date;
}): Promise<ResultatEnvoi> {
  const message = messageInvitation(params);
  return envoyer({
    to: params.destinataire,
    toName: params.contactNom,
    sujet: message.sujet,
    texte: message.texte,
    html: message.html,
  });
}

export type NotificationAExpedier = {
  envoi_id: string;
  email: string;
  type: string;
  libelle: string;
  categorie: string;
  chantier: string | null;
  reserve_numero: number | null;
  reserve_titre: string | null;
  reserve_id: string | null;
  organisation: string | null;
  payload: Record<string, unknown> | null;
};

export function messageNotification(evenement: NotificationAExpedier, baseUrl: string) {
  const reserve = evenement.reserve_numero !== null
    ? `réserve n°${evenement.reserve_numero}${evenement.reserve_titre ? ` — ${evenement.reserve_titre}` : ""}`
    : null;
  const chantier = evenement.chantier ? `chantier « ${evenement.chantier} »` : "un de vos chantiers";
  const lien = evenement.reserve_id
    ? `${baseUrl}/reserves/${evenement.reserve_id}`
    : `${baseUrl}/dashboard`;

  const sujet = reserve
    ? `${evenement.libelle} — ${reserve}`
    : `${evenement.libelle} — ${evenement.chantier ?? "ELSATIA Réserves"}`;

  const ligne = reserve
    ? `${evenement.libelle} sur le ${chantier} : ${reserve}.`
    : `${evenement.libelle} sur le ${chantier}.`;

  const texte = [
    "Bonjour,",
    "",
    ligne,
    evenement.organisation ? `Organisation : ${evenement.organisation}.` : "",
    "",
    "Consulter dans ELSATIA Réserves :",
    lien,
    "",
    "Vous pouvez régler les e-mails que vous recevez, catégorie par catégorie, depuis",
    `${baseUrl}/parametres/notifications`,
  ].filter(Boolean).join("\n");

  const html = gabaritEmailElsatia({
    application: APPLICATION,
    titre: evenement.libelle,
    paragraphes: [
      echapperHtml(ligne),
      evenement.organisation ? `Organisation&nbsp;: ${echapperHtml(evenement.organisation)}.` : "",
    ].filter(Boolean),
    bouton: { libelle: "Ouvrir dans ELSATIA Réserves", url: lien },
    piedDePage: `Vous réglez ces e-mails, catégorie par catégorie, depuis `
      + `<a href="${echapperHtml(baseUrl)}/parametres/notifications">vos préférences de notification</a>. `
      + "Les alertes importantes restent toujours visibles dans l’application.",
  });

  return { sujet, texte, html };
}

export async function envoyerNotification(
  evenement: NotificationAExpedier,
  baseUrl: string,
): Promise<ResultatEnvoi> {
  const message = messageNotification(evenement, baseUrl);
  return envoyer({
    to: evenement.email,
    sujet: message.sujet,
    texte: message.texte,
    html: message.html,
  });
}
