"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { estCodeApplicationElsatia } from "@elsatia/application-access";
import { estAdministrateurPlateformeMultiApp } from "@/lib/multi-app-server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE = /^[a-z][a-z0-9_]{1,79}$/;

function retourEntreprise(entrepriseId: string, type: "succes" | "error", message: string) {
  return `/plateforme/entreprises/${entrepriseId}/applications?${type}=${encodeURIComponent(message)}`;
}

function dateOptionnelle(formData: FormData, cle: string): string | null {
  const valeur = String(formData.get(cle) ?? "").trim();
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
  const valideDu = dateOptionnelle(formData, "valide_du");
  const valideJusquAu = dateOptionnelle(formData, "valide_jusqu_au");
  if (valideDu && valideJusquAu && new Date(valideJusquAu) <= new Date(valideDu)) {
    redirect(retourEntreprise(entrepriseId, "error", "La fin de validité doit suivre le début"));
  }
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
  const valideDu = dateOptionnelle(formData, "valide_du");
  const valideJusquAu = dateOptionnelle(formData, "valide_jusqu_au");
  if (valideDu && valideJusquAu && new Date(valideJusquAu) <= new Date(valideDu)) {
    redirect(retourEntreprise(entrepriseId, "error", "La fin de validité doit suivre le début"));
  }
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
