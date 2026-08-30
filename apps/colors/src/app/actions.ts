"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinationInterneSure } from "@/lib/securite/redirections";

const MESSAGE_SANS_COLORS = "Votre compte ELSATIA ne dispose pas d’un accès actif à Colors.";

type ContexteCanonique = {
  entreprise_id: string | null;
};

function texte(formData: FormData, cle: string) {
  return String(formData.get(cle) ?? "").trim();
}

export async function connexionAction(formData: FormData) {
  const email = texte(formData, "email");
  const password = texte(formData, "password");
  const destination = destinationInterneSure(texte(formData, "next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent("Identifiants incorrects.")}`);

  // Si le compte possède un facteur MFA vérifié, la session est encore en aal1 :
  // exiger le second facteur avant d'ouvrir Colors. Le facteur MFA Supabase est
  // commun au compte même si les sessions restent cloisonnées par domaine.
  const { data: niveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau?.currentLevel === "aal1" && niveau?.nextLevel === "aal2") {
    redirect(`/login/mfa?next=${encodeURIComponent(destination)}`);
  }

  const { data: contexte, error: erreurContexte } = await supabase
    .rpc("contexte_application_courant")
    .maybeSingle();
  if (erreurContexte || !contexte) {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent(MESSAGE_SANS_COLORS)}`);
  }

  const canonique = contexte as ContexteCanonique;
  const { data: autorise, error: erreurAcces } = await supabase.rpc("a_acces_application", {
    p_entreprise_id: canonique.entreprise_id,
    p_application_code: "colors",
  });
  if (erreurAcces) {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent(MESSAGE_SANS_COLORS)}`);
  }
  if (autorise === true) redirect(destination);

  // Une authentification valide ne doit jamais être présentée comme un échec
  // de mot de passe. On ferme néanmoins la session non autorisée avant de
  // revenir au formulaire avec le message produit attendu.
  await supabase.auth.signOut();
  redirect(`/login?error=${encodeURIComponent(MESSAGE_SANS_COLORS)}`);
}

export async function deconnexionAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?message=Vous êtes déconnecté");
}
