"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cheminInterneSur } from "@/lib/redirection-sure";
import {
  CODE_ACCES_COLORS_ABSENT,
  CODE_DECONNEXION,
  CODE_IDENTIFIANTS_INVALIDES,
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
