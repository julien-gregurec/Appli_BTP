"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { estCodeApplicationElsatia } from "@elsatia/application-access";
import { estAdministrateurPlateformeMultiApp, estProprietairePlateforme } from "@/lib/multi-app-server";
import { normaliserUrlPreview } from "@/lib/multi-app";
import { lireDateHeureFormulaire } from "@/lib/date-heure-locale";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE = /^[a-z][a-z0-9_]{1,79}$/;

function retourEntreprise(entrepriseId: string, type: "succes" | "error", message: string) {
  return `/plateforme/entreprises/${entrepriseId}/applications?${type}=${encodeURIComponent(message)}`;
}

// V9-01 / V9-02 (post-V9) : heure murale + fuseau du navigateur (ChampDateHeure), convertie
// explicitement ; une date saisie mais invalide est refusée au lieu de valoir « sans date »
// (l'ancien `new Date(valeur)` lisait l'heure dans le fuseau du serveur et rabattait une
// valeur invalide sur null, soit une habilitation sans fin).
function fenetreValidite(formData: FormData, entrepriseId: string) {
  const debut = lireDateHeureFormulaire(formData, "valide_du");
  const fin = lireDateHeureFormulaire(formData, "valide_jusqu_au");
  if (debut.statut === "invalide" || fin.statut === "invalide") {
    redirect(retourEntreprise(entrepriseId, "error", "Date ou heure invalide"));
  }
  if (debut.iso && fin.iso && new Date(fin.iso) <= new Date(debut.iso)) {
    redirect(retourEntreprise(entrepriseId, "error", "La fin de validité doit suivre le début"));
  }
  return { valideDu: debut.iso, valideJusquAu: fin.iso };
}

async function verifierAction(entrepriseId: string, applicationCode: string) {
  if (!(await estAdministrateurPlateformeMultiApp())) redirect("/dashboard");
  if (!UUID.test(entrepriseId) || !estCodeApplicationElsatia(applicationCode)) {
    redirect("/plateforme/applications?error=Param%C3%A8tres%20invalides");
  }
}

function revalider(entrepriseId: string) {
  revalidatePath("/plateforme");
  revalidatePath("/plateforme/applications");
  revalidatePath(`/plateforme/entreprises/${entrepriseId}/applications`);
}

export async function activerApplicationEntrepriseAction(
  entrepriseId: string,
  applicationCode: string,
  formData: FormData,
) {
  await verifierAction(entrepriseId, applicationCode);
  const { valideDu, valideJusquAu } = fenetreValidite(formData, entrepriseId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_activer_application_entreprise", {
    p_entreprise_id: entrepriseId,
    p_application_code: applicationCode,
    p_valide_du: valideDu,
    p_valide_jusqu_au: valideJusquAu,
    p_source: "administration_elsatia",
    p_reference_externe: null,
  });
  if (error) redirect(retourEntreprise(entrepriseId, "error", "Activation impossible"));
  revalider(entrepriseId);
  redirect(retourEntreprise(entrepriseId, "succes", "Application activée"));
}

export async function desactiverApplicationEntrepriseAction(
  entrepriseId: string,
  applicationCode: string,
) {
  await verifierAction(entrepriseId, applicationCode);
  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_desactiver_application_entreprise", {
    p_entreprise_id: entrepriseId,
    p_application_code: applicationCode,
  });
  if (error) redirect(retourEntreprise(entrepriseId, "error", "Désactivation impossible"));
  revalider(entrepriseId);
  redirect(retourEntreprise(entrepriseId, "succes", "Application désactivée sans suppression de données"));
}

export async function habiliterUtilisateurApplicationAction(
  entrepriseId: string,
  utilisateurId: string,
  applicationCode: string,
  formData: FormData,
) {
  await verifierAction(entrepriseId, applicationCode);
  const roleCode = String(formData.get("role_code") ?? "").trim();
  if (!UUID.test(utilisateurId) || !ROLE.test(roleCode)) {
    redirect(retourEntreprise(entrepriseId, "error", "Utilisateur ou rôle invalide"));
  }
  const { valideDu, valideJusquAu } = fenetreValidite(formData, entrepriseId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_habiliter_utilisateur_application", {
    p_utilisateur_id: utilisateurId,
    p_entreprise_id: entrepriseId,
    p_application_code: applicationCode,
    p_role_code: roleCode,
    p_valide_du: valideDu,
    p_valide_jusqu_au: valideJusquAu,
  });
  if (error) redirect(retourEntreprise(entrepriseId, "error", "Habilitation impossible"));
  revalider(entrepriseId);
  redirect(retourEntreprise(entrepriseId, "succes", "Habilitation enregistrée"));
}

export async function retirerHabilitationApplicationAction(
  entrepriseId: string,
  utilisateurId: string,
  applicationCode: string,
) {
  await verifierAction(entrepriseId, applicationCode);
  if (!UUID.test(utilisateurId)) redirect(retourEntreprise(entrepriseId, "error", "Utilisateur invalide"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_retirer_habilitation_application", {
    p_utilisateur_id: utilisateurId,
    p_entreprise_id: entrepriseId,
    p_application_code: applicationCode,
  });
  if (error) redirect(retourEntreprise(entrepriseId, "error", "Retrait impossible"));
  revalider(entrepriseId);
  redirect(retourEntreprise(entrepriseId, "succes", "Habilitation retirée"));
}

/**
 * A-11 (ELSATIA_SATELLITES_PREVIEW_READINESS_V2) : URL Preview d'une application du catalogue.
 * Propriétaire plateforme uniquement ; la RPC revérifie tout (propriétaire, AAL2, origine stricte,
 * jamais une URL de Production) et journalise. Un administrateur d'entreprise ou un
 * administrateur plateforme délégué n'atteint jamais la base.
 */
export async function definirUrlPreviewApplicationAction(applicationCode: string, formData: FormData) {
  const retour = (type: "succes" | "error", message: string) =>
    `/plateforme/applications?${type}=${encodeURIComponent(message)}`;
  if (!(await estProprietairePlateforme())) {
    redirect(retour("error", "Modification réservée au propriétaire de la plateforme ELSATIA"));
  }
  if (!estCodeApplicationElsatia(applicationCode)) redirect(retour("error", "Paramètres invalides"));
  const normalisee = normaliserUrlPreview(String(formData.get("url_preview") ?? ""));
  if (!normalisee.ok) redirect(retour("error", normalisee.motif));

  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_definir_url_preview_application", {
    p_code: applicationCode,
    p_url: normalisee.url,
  });
  if (error) redirect(retour("error", error.message));
  revalidatePath("/plateforme/applications");
  redirect(retour("succes", normalisee.url ? `URL Preview de ${applicationCode} enregistrée` : `URL Preview de ${applicationCode} effacée`));
}
