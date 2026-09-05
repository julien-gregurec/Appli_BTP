"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cheminInterneSur } from "@/lib/redirection-sure";
import { urlCallbackReinitialisation } from "@/lib/auth-redirects-colors";
import { journaliserEchecTechnique } from "@/lib/journal-securite";
import {
  CODE_ACCES_COLORS_ABSENT,
  CODE_DECONNEXION,
  CODE_DEMANDE_ENVOYEE,
  CODE_EMAIL_REQUIS,
  CODE_IDENTIFIANTS_INVALIDES,
  CODE_LIEN_INVALIDE,
  CODE_MOT_DE_PASSE_MODIFIE,
  CODE_MOT_DE_PASSE_REFUSE,
  CODE_MOT_DE_PASSE_TROP_COURT,
  CODE_MOTS_DE_PASSE_DIFFERENTS,
  CODE_RESET_INDISPONIBLE,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
} from "@/lib/messages-auth";

type ContexteCanonique = {
  entreprise_id: string | null;
};

function texte(formData: FormData, cle: string) {
  return String(formData.get(cle) ?? "").trim();
}

export async function connexionAction(formData: FormData) {
  const email = texte(formData, "email");
  const password = texte(formData, "password");
  const destination = cheminInterneSur(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${CODE_IDENTIFIANTS_INVALIDES}`);

  const { data: contexte, error: erreurContexte } = await supabase
    .rpc("contexte_application_courant")
    .maybeSingle();
  if (erreurContexte || !contexte) {
    await supabase.auth.signOut();
    redirect(`/login?error=${CODE_ACCES_COLORS_ABSENT}`);
  }

  const canonique = contexte as ContexteCanonique;
  const { data: autorise, error: erreurAcces } = await supabase.rpc("a_acces_application", {
    p_entreprise_id: canonique.entreprise_id,
    p_application_code: "colors",
  });
  if (erreurAcces) {
    await supabase.auth.signOut();
    redirect(`/login?error=${CODE_ACCES_COLORS_ABSENT}`);
  }
  if (autorise === true) redirect(destination);

  // Une authentification valide ne doit jamais être présentée comme un échec
  // de mot de passe. On ferme néanmoins la session non autorisée avant de
  // revenir au formulaire avec le message produit attendu.
  await supabase.auth.signOut();
  redirect(`/login?error=${CODE_ACCES_COLORS_ABSENT}`);
}

export async function deconnexionAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/login?message=${CODE_DECONNEXION}`);
}

/**
 * Demande d'envoi d'un lien de réinitialisation.
 *
 * Anti-énumération : hors saisie vide, la page revient **toujours** sur la même
 * confirmation neutre, que l'adresse corresponde à un compte ELSATIA ou non, et
 * que Supabase ait accepté ou refusé la demande. Le refus technique n'est visible
 * que dans les journaux serveur. Deux réponses distinctes ici suffiraient à
 * transformer le formulaire en oracle d'existence de comptes.
 */
export async function demanderReinitialisationAction(formData: FormData) {
  const email = texte(formData, "email").toLowerCase();
  if (!email) redirect(`/mot-de-passe-oublie?error=${CODE_EMAIL_REQUIS}`);

  const redirectTo = urlCallbackReinitialisation();
  if (!redirectTo) {
    // Origine publique non configurée : envoyer un lien vers un hôte non
    // maîtrisé serait pire que ne rien envoyer. Message d'indisponibilité
    // assumé — il ne dépend pas de l'adresse saisie et ne révèle donc rien.
    journaliserEchecTechnique("reinitialisation.url-callback", {
      message: "NEXT_PUBLIC_COLORS_URL absente ou invalide",
    });
    redirect(`/mot-de-passe-oublie?error=${CODE_RESET_INDISPONIBLE}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) journaliserEchecTechnique("reinitialisation.demande", error);
  redirect(`/mot-de-passe-oublie?message=${CODE_DEMANDE_ENVOYEE}`);
}

/**
 * Définition du nouveau mot de passe.
 *
 * La session ouverte par le lien de récupération est la seule autorisation :
 * sans session, la demande retourne au formulaire « mot de passe oublié ». La
 * session est refermée après modification, pour que le changement soit confirmé
 * par une connexion explicite.
 */
export async function modifierMotDePasseAction(formData: FormData) {
  const motDePasse = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/mot-de-passe-oublie?error=${CODE_LIEN_INVALIDE}`);

  if (motDePasse.length < LONGUEUR_MINIMALE_MOT_DE_PASSE) {
    redirect(`/nouveau-mot-de-passe?error=${CODE_MOT_DE_PASSE_TROP_COURT}`);
  }
  if (motDePasse !== confirmation) {
    redirect(`/nouveau-mot-de-passe?error=${CODE_MOTS_DE_PASSE_DIFFERENTS}`);
  }

  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) {
    journaliserEchecTechnique("reinitialisation.mise-a-jour", error);
    redirect(`/nouveau-mot-de-passe?error=${CODE_MOT_DE_PASSE_REFUSE}`);
  }

  await supabase.auth.signOut();
  redirect(`/login?message=${CODE_MOT_DE_PASSE_MODIFIE}`);
}
