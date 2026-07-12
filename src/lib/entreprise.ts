import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

export type ContexteEntreprise = {
  userId: string;
  prenom: string | null;
  entrepriseId: string;
  entrepriseNom: string;
  entrepriseReference: string | null;
  logoUrl: string | null;
};

type DevContexteEntreprise = {
  user_id: string;
  prenom: string | null;
  entreprise_id: string | null;
  entreprise_nom: string | null;
  entreprise_reference: string | null;
};

async function getContexteEntrepriseSansConnexion(): Promise<ContexteEntreprise> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dev_contexte_entreprise").maybeSingle();
  const contexte = data as DevContexteEntreprise | null;

  if (error) {
    throw new Error(
      "Mode sans connexion actif, mais la migration 08_mode_sans_connexion.sql n'est pas encore appliquée.",
    );
  }

  if (!contexte?.entreprise_id) {
    redirect("/onboarding");
  }

  const {data:entreprise}=await supabase.from("entreprises").select("logo_url").eq("id",contexte.entreprise_id).maybeSingle();
  return {
    userId: contexte.user_id,
    prenom: contexte.prenom,
    entrepriseId: contexte.entreprise_id,
    entrepriseNom: contexte.entreprise_nom ?? "",
    entrepriseReference: contexte.entreprise_reference ?? null,
    logoUrl: entreprise?.logo_url ?? null,
  };
}

// Résout l'utilisateur connecté + son entreprise active, ou redirige (login / onboarding).
export async function getContexteEntreprise(): Promise<ContexteEntreprise> {
  if (isEmailLoginDisabled()) {
    return getContexteEntrepriseSansConnexion();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("prenom, entreprise_active_id")
    .eq("id", user.id)
    .single();

  if (!profil?.entreprise_active_id) {
    redirect("/onboarding");
  }

  // Un membre qui a rejoint par code reste "en attente" tant que l'admin ne l'a pas
  // activé (affectation d'un poste). Tant qu'il n'est pas actif, il n'a accès à rien.
  const { data: appartenance } = await supabase
    .from("utilisateurs_entreprises")
    .select("statut")
    .eq("utilisateur_id", user.id)
    .eq("entreprise_id", profil.entreprise_active_id)
    .maybeSingle();
  if (appartenance && appartenance.statut !== "actif") {
    redirect("/en-attente");
  }

  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("nom, reference_interne, logo_url")
    .eq("id", profil.entreprise_active_id)
    .single();

  return {
    userId: user.id,
    prenom: profil.prenom,
    entrepriseId: profil.entreprise_active_id,
    entrepriseNom: entreprise?.nom ?? "",
    entrepriseReference: entreprise?.reference_interne ?? null,
    logoUrl: entreprise?.logo_url ?? null,
  };
}
