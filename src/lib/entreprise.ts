import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { cheminAccessibleEssaiExpire } from "@/lib/acces-socle-essai";

// Chemins qui restent accessibles quand l'essai est expiré sans offre — souscrire,
// demander de l'aide, récupérer ses données (ELSATIA-GP-TRIAL-EXPIRY-P1-CLOSURE-V1).
// La liste fait autorité dans src/lib/acces-socle-essai.ts ; c'est le middleware
// (src/lib/supabase/proxy.ts) qui transmet le chemin via cet en-tête, un Server
// Component n'y ayant pas accès autrement.

// Sentinel utilisé quand aucune entreprise réelle n'est rattachée (même convention
// que compteurs_reference : aucune entreprise n'a jamais cet id, donc les requêtes
// scopées par entrepriseId ne remontent rien plutôt que de fuiter des données réelles.
const ENTREPRISE_ID_ADMIN_PLATEFORME = "00000000-0000-0000-0000-000000000000";

export type ContexteEntreprise = {
  userId: string;
  prenom: string | null;
  entrepriseId: string;
  entrepriseNom: string;
  entrepriseReference: string | null;
  logoUrl: string | null;
  abonnementStatut: string;
  abonnementEcheance: string | null;
  abonnementEssaiDebut: string | null;
  abonnementEssaiFin: string | null;
  suspensionPrevueAt: string | null;
  impayeMessage: string | null;
  accesSupportPlateforme: boolean;
  // Essai (30 jours) expiré sans offre active. N'est jamais `true` que sur les
  // chemins de sortie d'essai (CHEMINS_ACCESSIBLES_ESSAI_EXPIRE : abonnement,
  // aide, données RGPD) : tout autre appelant est redirigé vers
  // /abonnement-suspendu avant de recevoir ce contexte, pour que les pages
  // métier restent bloquées proprement.
  essaiExpireSansOffre: boolean;
};

/** Ajoute `jours` jours calendaires à une date ISO (YYYY-MM-DD), en UTC. */
function ajouterJoursIso(dateIso: string, jours: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + jours);
  return date.toISOString().slice(0, 10);
}

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
  abonnement_essai_debut: string | null;
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
    abonnementEssaiDebut: null,
    abonnementEssaiFin: null,
    suspensionPrevueAt: null,
    impayeMessage: null,
    accesSupportPlateforme: false,
    essaiExpireSansOffre: false,
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
    // Un admin plateforme n'est rattaché à aucune entreprise cliente par nature :
    // on ne le rattache jamais artificiellement à l'une d'elles, on lui donne un
    // contexte neutre plutôt que de le renvoyer vers l'onboarding entreprise.
    if (await estPlateformeAdmin()) {
      return {
        userId: user.id,
        prenom: profil?.prenom ?? null,
        entrepriseId: ENTREPRISE_ID_ADMIN_PLATEFORME,
        entrepriseNom: "Administration ELSATIA",
        entrepriseReference: null,
        logoUrl: null,
        abonnementStatut: "actif",
        abonnementEcheance: null,
        abonnementEssaiDebut: null,
        abonnementEssaiFin: null,
        suspensionPrevueAt: null,
        impayeMessage: null,
        accesSupportPlateforme: false,
        essaiExpireSansOffre: false,
      };
    }
    redirect("/onboarding");
  }

  const abonnement = abonnementData as ContexteAbonnementCourant | null;
  if (!abonnement?.entreprise_id) redirect("/onboarding");
  const suspensionAt = abonnement.suspension_prevue_at ? new Date(abonnement.suspension_prevue_at).getTime() : null;
  const accesSupport = abonnement.acces_support === true;

  // Fenêtre d'essai bornée à 30 jours (ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1) :
  // abonnement_essai_fin fait autorité ; si historiquement absente, on retombe
  // sur abonnement_essai_debut + 30 jours, jamais sur une fenêtre illimitée.
  const essaiFinEffective = abonnement.abonnement_essai_fin
    ?? (abonnement.abonnement_essai_debut ? ajouterJoursIso(abonnement.abonnement_essai_debut, 30) : null);
  const essaiFin = essaiFinEffective ? new Date(`${essaiFinEffective}T23:59:59.999Z`).getTime() : null;

  const suspenduPourImpaye = !accesSupport && (
    ["suspendu", "annule"].includes(abonnement.abonnement_statut)
    || (suspensionAt !== null && suspensionAt <= Date.now())
  );
  const essaiExpireSansOffre = !accesSupport
    && abonnement.abonnement_statut === "essai"
    && essaiFin !== null
    && essaiFin < Date.now();

  if (suspenduPourImpaye) {
    redirect("/abonnement-suspendu");
  }
  if (essaiExpireSansOffre) {
    // Le métier reste bloqué ; l'aide, l'export RGPD et la souscription restent
    // ouverts — un essai terminé ne doit pas retenir les données du client.
    const cheminActuel = (await headers()).get("x-elsatia-pathname");
    if (!cheminAccessibleEssaiExpire(cheminActuel)) {
      redirect("/abonnement-suspendu?motif=essai_expire");
    }
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
    abonnementEssaiDebut: abonnement.abonnement_essai_debut ?? null,
    abonnementEssaiFin: abonnement.abonnement_essai_fin ?? null,
    suspensionPrevueAt: abonnement.suspension_prevue_at ?? null,
    impayeMessage: abonnement.impaye_message ?? null,
    accesSupportPlateforme: accesSupport,
    essaiExpireSansOffre,
  };
});
