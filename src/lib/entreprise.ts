import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin, statutIdentitePlateforme } from "@/lib/plateforme";

// Sentinel utilisé quand aucune entreprise réelle n'est rattachée (même convention
// que compteurs_reference : aucune entreprise n'a jamais cet id, donc les requêtes
// scopées par entrepriseId ne remontent rien plutôt que de fuiter des données réelles.
// Exporté : sert de marqueur "admin plateforme sans entreprise" pour le layout
// (redirection) et le menu (masquage des rubriques métier).
export const ENTREPRISE_ID_ADMIN_PLATEFORME = "00000000-0000-0000-0000-000000000000";

// Chemins que peut ouvrir une identité plateforme active SANS entreprise cliente
// (contexte neutre) sans être renvoyée vers /plateforme : les fonctions
// d'administration plateforme elles-mêmes, et la sécurité de son propre compte
// (MFA/AAL2). Tout le reste (racine, tableau de bord, mon-espace, routes
// métier d'entreprise) n'a pas de sens sans entreprise cliente rattachée.
export function cheminAutoriseAdminPlateformeSansEntreprise(pathname: string): boolean {
  return (
    pathname === "/plateforme" ||
    pathname.startsWith("/plateforme/") ||
    pathname === "/mon-espace/securite" ||
    pathname.startsWith("/mon-espace/securite/")
  );
}

export type ContexteEntreprise = {
  userId: string;
  prenom: string | null;
  entrepriseId: string;
  entrepriseNom: string;
  entrepriseReference: string | null;
  logoUrl: string | null;
  abonnementStatut: string;
  abonnementEcheance: string | null;
  abonnementEssaiFin: string | null;
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
  abonnement_echeance: string | null;
  abonnement_essai_fin: string | null;
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
    abonnementEcheance: null,
    abonnementEssaiFin: null,
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

  // Le profil et l'abonnement ne dépendent que de la session, pas l'un de
  // l'autre : les enchaîner coûtait un aller-retour pour rien.
  const [{ data: profil }, { data: abonnementData }] = await Promise.all([
    supabase.from("utilisateurs").select("prenom, entreprise_active_id").eq("id", user.id).single(),
    supabase.rpc("contexte_abonnement_courant").maybeSingle(),
  ]);

  if (!profil?.entreprise_active_id) {
    const [estAdminPlateforme, statutIdentite] = await Promise.all([
      estPlateformeAdmin(),
      statutIdentitePlateforme(),
    ]);
    // Un admin plateforme n'est rattaché à aucune entreprise cliente par nature :
    // on ne le rattache jamais artificiellement à l'une d'elles, on lui donne un
    // contexte neutre plutôt que de le renvoyer vers l'onboarding entreprise.
    if (estAdminPlateforme) {
      return {
        userId: user.id,
        prenom: profil?.prenom ?? null,
        entrepriseId: ENTREPRISE_ID_ADMIN_PLATEFORME,
        entrepriseNom: "Administration ELSATIA",
        entrepriseReference: null,
        logoUrl: null,
        abonnementStatut: "actif",
        abonnementEcheance: null,
        abonnementEssaiFin: null,
        suspensionPrevueAt: null,
        impayeMessage: null,
        accesSupportPlateforme: false,
      };
    }
    // Voie B : une identité plateforme connue mais NON active (en attente,
    // rattachée non confirmée, révoquée) n'est pas un prospect. On ne lui propose
    // jamais l'onboarding entreprise (elle ne doit créer aucune entreprise) : on
    // renvoie un refus sécurisé. Seule une activation explicite (AAL2, par un
    // admin actif) lui ouvrira /plateforme.
    if (statutIdentite && statutIdentite !== "active") {
      redirect("/acces-refuse?motif=identite_plateforme_en_attente");
    }
    redirect("/onboarding");
  }

  const abonnement = abonnementData as ContexteAbonnementCourant | null;
  if (!abonnement?.entreprise_id) redirect("/onboarding");
  const suspensionAt = abonnement.suspension_prevue_at ? new Date(abonnement.suspension_prevue_at).getTime() : null;
  const essaiFin = abonnement.abonnement_essai_fin ? new Date(`${abonnement.abonnement_essai_fin}T23:59:59.999Z`).getTime() : null;
  const accesSupport = abonnement.acces_support === true;
  if (!accesSupport && (["suspendu", "annule"].includes(abonnement.abonnement_statut) || (suspensionAt !== null && suspensionAt <= Date.now()) || (abonnement.abonnement_statut === "essai" && essaiFin !== null && essaiFin < Date.now()))) {
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
    abonnementEcheance: abonnement.abonnement_echeance ?? null,
    abonnementEssaiFin: abonnement.abonnement_essai_fin ?? null,
    suspensionPrevueAt: abonnement.suspension_prevue_at ?? null,
    impayeMessage: abonnement.impaye_message ?? null,
    accesSupportPlateforme: accesSupport,
  };
});
