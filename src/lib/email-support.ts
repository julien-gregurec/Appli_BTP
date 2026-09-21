import { MARQUE } from "@/lib/brand";

// E-mail ELSATIA → demandeur, envoyé quand le support répond dans le fil in-app.
// Fonctions PURES, sur le modèle de `src/lib/email-abonnement.ts` : aucun envoi,
// aucun accès réseau, aucune lecture d'environnement.

export type ContenuEmail = { sujet: string; texte: string; html: string };

const LONGUEUR_SUJET_MAX = 80;
const LONGUEUR_EXTRAIT_MAX = 240;

// Le contenu injecté ici est saisi par un opérateur ou par le demandeur : il
// n'est jamais de confiance côté HTML, contrairement aux e-mails abonnement dont
// toutes les valeurs sont dérivées de Stripe ou du catalogue d'offres.
function echapperHtml(valeur: string) {
  return valeur
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tronquer(valeur: string, maximum: number) {
  if (valeur.length <= maximum) return valeur;
  return `${valeur.slice(0, maximum).trimEnd()}…`;
}

// Référence lisible et stable d'un fil : dans le modèle courant, un fil support
// est identifié canoniquement par `entreprise_id` (cf. migration 239). On n'en
// expose que le préfixe, uniquement pour permettre au client et au support de
// parler du même échange.
export function referenceFilSupport(entrepriseId: string | null | undefined) {
  const valeur = entrepriseId?.trim();
  if (!valeur || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valeur)) return null;
  return `SUP-${valeur.slice(0, 8).toUpperCase()}`;
}

// « Sujet » de la demande : le produit n'a pas de champ sujet, un fil est une
// conversation. On reprend donc la première ligne de la demande — texte écrit
// par le destinataire lui-même, donc rien qu'il ne connaisse déjà.
export function sujetDemandeSupport(demande: string | null | undefined) {
  const ligne = (demande ?? "")
    .split("\n")
    .map((bloc) => bloc.replace(/\s+/g, " ").trim())
    .find((bloc) => bloc.length > 0);
  return ligne ? tronquer(ligne, LONGUEUR_SUJET_MAX) : null;
}

// Extrait de la réponse : c'est le message que l'opérateur vient d'adresser au
// client, jamais une note interne — le fil support n'en comporte pas. Tronqué
// pour que l'e-mail reste une notification et non un canal de conversation.
export function extraitReponseSupport(reponse: string | null | undefined, maximum = LONGUEUR_EXTRAIT_MAX) {
  const normalise = (reponse ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalise) return null;
  return tronquer(normalise.split("\n").map((bloc) => bloc.trim()).filter(Boolean).join(" "), maximum);
}

function paragraphesHtml(texte: string, bouton?: { libelle: string; lien: string } | null) {
  const corps = texte
    .split("\n\n")
    .map((bloc) => `<p style="margin:0 0 12px;">${bloc.split("\n").map(echapperHtml).join("<br>")}</p>`)
    .join("");
  const action = bouton
    ? `<p style="margin:20px 0;"><a href="${echapperHtml(bouton.lien)}" style="display:inline-block;background:#0d1b2a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">${echapperHtml(bouton.libelle)}</a></p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px;">${corps}${action}</div>`;
}

export function contenuEmailReponseSupport(opts: {
  prenom?: string | null;
  nom?: string | null;
  entrepriseNom?: string | null;
  reference?: string | null;
  sujet?: string | null;
  extrait?: string | null;
  lienSupport?: string | null;
  emailSupport?: string | null;
}): ContenuEmail {
  const destinataire = [opts.prenom?.trim(), opts.nom?.trim()].filter(Boolean).join(" ");
  const salutation = destinataire ? `Bonjour ${destinataire},` : "Bonjour,";

  const recapitulatif = [
    opts.reference ? `Référence : ${opts.reference}` : null,
    opts.entrepriseNom?.trim() ? `Entreprise : ${opts.entrepriseNom.trim()}` : null,
    opts.sujet ? `Votre demande : ${opts.sujet}` : null,
  ].filter((ligne): ligne is string => ligne !== null);

  const texte = [
    salutation,
    "",
    `L'équipe support ${MARQUE} vient de répondre à votre demande.`,
    ...(recapitulatif.length ? ["", recapitulatif.join("\n")] : []),
    ...(opts.extrait ? ["", `« ${opts.extrait} »`] : []),
    "",
    opts.lienSupport
      ? "Cet e-mail ne reprend qu'un extrait : la réponse complète et la suite de l'échange se trouvent dans votre espace d'aide."
      : "Cet e-mail ne reprend qu'un extrait : connectez-vous à votre espace d'aide pour lire la réponse complète et poursuivre l'échange.",
    "",
    opts.emailSupport
      ? `Vous pouvez aussi nous écrire directement à ${opts.emailSupport}.`
      : "Vous pouvez aussi répondre directement au support depuis votre espace d'aide.",
    "",
    "Cordialement,",
    `L'équipe ${MARQUE}`,
  ].join("\n");

  return {
    sujet: `Réponse du support ${MARQUE}`,
    texte,
    html: paragraphesHtml(texte, opts.lienSupport ? { libelle: "Ouvrir mon espace d'aide", lien: opts.lienSupport } : null),
  };
}
