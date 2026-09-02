"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const suivant = texte(formData, "next");
  const destination = suivant.startsWith("/") && !suivant.startsWith("//") ? suivant : "/dashboard";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent("Identifiants incorrects.")}`);

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
