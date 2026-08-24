// RELANCES-AUTO-V1 : contenu des emails de relance — même idiome de construction que
// contenuEmailDocument()/corpsHtmlEmailDocument() (src/lib/email.ts), réutilisé tel quel
// pour la mise en forme HTML. Ton professionnel, neutre, non agressif par défaut (§14/§16) :
// pas de "URGENT"/"DERNIÈRE CHANCE".

import { euros } from "@/lib/devis";
import { libelleNiveauRelance, type TypeDocumentRelance } from "@/lib/relances";

type ClientMail = { nom: string | null; prenom: string | null; societe: string | null; email: string | null };

function salutationClient(client: ClientMail): string {
  return client.societe || [client.prenom, client.nom].filter(Boolean).join(" ") || "Madame, Monsieur";
}

export function contenuEmailRelanceDevis(opts: {
  numero: string | null;
  client: ClientMail;
  montantTtc: number;
  dateEmission: string | null;
  entrepriseNom: string;
  prenomEmetteur?: string | null;
  niveau: number;
  nombreMax: number;
}): { to: string; sujet: string; corps: string } | null {
  const to = opts.client.email?.trim();
  if (!to) return null;

  const ref = opts.numero ?? "devis";
  const salutation = salutationClient(opts.client);
  const estFinale = opts.niveau >= opts.nombreMax && opts.nombreMax > 1;
  const sujet = `Rappel concernant votre devis ${ref}`;

  const corps = [
    `Bonjour ${salutation},`,
    "",
    `Nous revenons vers vous au sujet du devis ${ref}${opts.dateEmission ? ` du ${opts.dateEmission}` : ""}, d'un montant de ${euros(opts.montantTtc)} TTC, resté sans réponse de votre part à ce jour.`,
    "",
    estFinale
      ? "Sans nouvelle de votre part, ce devis pourra être classé sans suite. N'hésitez pas à nous contacter si vous souhaitez en discuter ou si vous avez besoin d'un délai supplémentaire."
      : "N'hésitez pas à nous contacter si vous avez des questions ou si vous souhaitez apporter des modifications à cette proposition.",
    "",
    "Cordialement,",
    opts.prenomEmetteur ? `${opts.prenomEmetteur} — ${opts.entrepriseNom}` : opts.entrepriseNom,
  ].join("\n");

  return { to, sujet, corps };
}

export function contenuEmailRelanceFacture(opts: {
  numero: string | null;
  client: ClientMail;
  resteAPayer: number;
  dateEcheance: string | null;
  entrepriseNom: string;
  prenomEmetteur?: string | null;
  niveau: number;
  nombreMax: number;
}): { to: string; sujet: string; corps: string } | null {
  const to = opts.client.email?.trim();
  if (!to) return null;

  const ref = opts.numero ?? "facture";
  const salutation = salutationClient(opts.client);
  const estFinale = opts.niveau >= opts.nombreMax && opts.nombreMax > 1;
  const sujet = `Rappel concernant la facture ${ref}`;

  const corps = [
    `Bonjour ${salutation},`,
    "",
    `Sauf erreur de notre part, la facture ${ref}${opts.dateEcheance ? `, échue le ${opts.dateEcheance},` : ""} reste à ce jour impayée pour un montant de ${euros(opts.resteAPayer)}.`,
    "",
    estFinale
      ? "Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais. Si un paiement a déjà été effectué récemment, merci de ne pas tenir compte de ce message."
      : "Nous vous remercions de bien vouloir régulariser cette situation dans les meilleurs délais, ou de nous contacter en cas de difficulté.",
    "",
    "Cordialement,",
    opts.prenomEmetteur ? `${opts.prenomEmetteur} — ${opts.entrepriseNom}` : opts.entrepriseNom,
  ].join("\n");

  return { to, sujet, corps };
}

export function libelleRelancePourAffichage(type: TypeDocumentRelance, niveau: number, nombreMax: number): string {
  return libelleNiveauRelance(type, niveau, nombreMax);
}
