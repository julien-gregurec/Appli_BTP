import { cache } from "react";
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
  abonnementStatut: string;
  suspensionPrevueAt: string | null;
  impayeMessage: string | null;
  accesSupportPlateforme: boolean;
};

type DevContexteEntreprise = {
  user_id: string;
  prenom: string | null;
  entreprise_id: string | null;
  entreprise_nom: string | null;
  entreprise_reference: string | null;
};

type ContexteAbonnementCourant = {
  entreprise_id: string;
  nom: string | null;
  reference_interne: string | null;
  logo_url: string | null;
  abonnement_statut: string;
  suspension_prevue_at: string | null;
  impaye_message: string | null;
  acces_support: boolean;
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
    abonnementStatut: "actif",
    suspensionPrevueAt: null,
    impayeMessage: null,
    accesSupportPlateforme: false,
  };
}

// Résout l'utilisateur connecté + son entreprise active, ou redirige (login / onboarding).
/**
 * Résout l'utilisateur connecté et son entreprise active.
 *
 * `cache()` dédoublonne les appels au sein d'un même rendu : le layout ET la
 * page appelaient chacun cette fonction, et chaque appel refaisait ses 4 à 5
 * allers-retours vers Supabase. À ~200 ms l'aller-retour, c'était ~1 s perdu
 * par page, pour le même résultat.
 */
export const getContexteEntreprise = cache(async function getContexteEntreprise(): Promise<ContexteEntreprise> {
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

  const { data: abonnementData } = await supabase
    .rpc("contexte_abonnement_courant")
    .maybeSingle();
  const abonnement = abonnementData as ContexteAbonnementCourant | null;
  if (!abonnement?.entreprise_id) redirect("/onboarding");
  const suspensionAt = abonnement.suspension_prevue_at ? new Date(abonnement.suspension_prevue_at).getTime() : null;
  const accesSupport = abonnement.acces_support === true;
  if (!accesSupport && (["suspendu", "annule"].includes(abonnement.abonnement_statut) || (suspensionAt !== null && suspensionAt <= Date.now()))) {
    redirect("/abonnement-suspendu");
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

  return {
    userId: user.id,
    prenom: profil.prenom,
    entrepriseId: profil.entreprise_active_id,
    entrepriseNom: abonnement.nom ?? "",
    entrepriseReference: abonnement.reference_interne ?? null,
    logoUrl: abonnement.logo_url ?? null,
    abonnementStatut: abonnement.abonnement_statut,
    suspensionPrevueAt: abonnement.suspension_prevue_at ?? null,
    impayeMessage: abonnement.impaye_message ?? null,
    accesSupportPlateforme: accesSupport,
  };
});
