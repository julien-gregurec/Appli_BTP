import "server-only";
import { brevoEstConfigure, envoyerEmailBrevo } from "@/lib/brevo";
import { creerConfigurationMarquePublique, creerConfigurationMarqueServeur } from "@/lib/brand";
import {
  contenuEmailReponseSupport,
  extraitReponseSupport,
  referenceFilSupport,
  sujetDemandeSupport,
} from "@/lib/email-support";

// Notification ELSATIA → demandeur, déclenchée par la réponse d'un opérateur
// support. Best-effort par construction, comme `abonnement-notifications.ts` :
// la réponse est déjà enregistrée en base quand on arrive ici, une panne Brevo
// ne doit donc jamais la faire échouer ni la faire rejouer.

export type ResultatNotificationSupport =
  | { envoye: true }
  | { envoye: false; motif: "brevo_non_configure" | "destinataire_absent" | "envoi_impossible" };

// Seul un chemin interne canonique est admis : l'origine officielle de
// l'application, jamais une URL reconstruite depuis une entrée utilisateur.
// `creerConfigurationMarquePublique` ne conserve que l'origine d'une URL
// http(s) valide, ce qui exclut toute redirection portée par un chemin.
export function lienEspaceSupport(environnement: Record<string, string | undefined> = process.env) {
  const origine = creerConfigurationMarquePublique(environnement).urlPublique;
  return origine ? `${origine}/aide` : null;
}

function adresseExploitable(valeur: string | null | undefined) {
  const adresse = valeur?.trim();
  if (!adresse || /\s/.test(adresse)) return null;
  return /^[^@]+@[^@.]+\.[^@]+$/.test(adresse) ? adresse : null;
}

export async function notifierReponseSupport(params: {
  destinataire: string | null | undefined;
  prenom?: string | null;
  nom?: string | null;
  entrepriseId: string;
  entrepriseNom?: string | null;
  demande?: string | null;
  reponse: string;
}): Promise<ResultatNotificationSupport> {
  const destinataire = adresseExploitable(params.destinataire);
  if (!destinataire) return { envoye: false, motif: "destinataire_absent" };
  if (!brevoEstConfigure()) return { envoye: false, motif: "brevo_non_configure" };

  const support = creerConfigurationMarqueServeur(process.env).supportEmail;
  const contenu = contenuEmailReponseSupport({
    prenom: params.prenom,
    nom: params.nom,
    entrepriseNom: params.entrepriseNom,
    reference: referenceFilSupport(params.entrepriseId),
    sujet: sujetDemandeSupport(params.demande),
    extrait: extraitReponseSupport(params.reponse),
    lienSupport: lienEspaceSupport(),
    emailSupport: support,
  });

  try {
    await envoyerEmailBrevo({
      to: destinataire,
      toName: [params.prenom?.trim(), params.nom?.trim()].filter(Boolean).join(" ") || undefined,
      sujet: contenu.sujet,
      texte: contenu.texte,
      html: contenu.html,
      replyTo: support,
    });
    return { envoye: true };
  } catch {
    // Jamais l'adresse du destinataire, le contenu du fil ni la réponse Brevo.
    console.warn("Notification réponse support non envoyée", { categorie: "envoi_impossible" });
    return { envoye: false, motif: "envoi_impossible" };
  }
}
