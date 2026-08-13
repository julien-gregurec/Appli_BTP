"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

const PAGE = "/parametres/donnees";

// Demande de suppression du compte : exige de retaper le nom de l'entreprise.
export async function demanderSuppressionAction(formData: FormData) {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const nomAttendu = String(formData.get("nom_entreprise") ?? "").trim();
  if (!confirmation || confirmation.toLowerCase() !== nomAttendu.toLowerCase()) {
    redirect(`${PAGE}?error=${encodeURIComponent("Le nom saisi ne correspond pas au nom de l'entreprise.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("demander_suppression_entreprise", { p_entreprise_id: entrepriseId });
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(messageErreurUtilisateur("demanderSuppressionAction", error, "Impossible d’enregistrer cette demande de suppression."))}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?message=${encodeURIComponent("Demande de suppression enregistrée.")}`);
}

export async function annulerSuppressionAction() {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const supabase = await createClient();
  const { error } = await supabase.rpc("annuler_suppression_entreprise", { p_entreprise_id: entrepriseId });
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(messageErreurUtilisateur("annulerSuppressionAction", error, "Impossible d’annuler cette demande de suppression."))}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?message=${encodeURIComponent("Demande de suppression annulée.")}`);
}

// Anonymisation d'un salarié (droit à l'effacement d'une personne).
export async function anonymiserEmployeAction(formData: FormData) {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const employeId = String(formData.get("employe_id") ?? "");
  if (!employeId) redirect("/employes");

  const supabase = await createClient();
  const { error } = await supabase.rpc("anonymiser_employe", {
    p_entreprise_id: entrepriseId,
    p_employe_id: employeId,
  });
  if (error) redirect(`/employes/${employeId}?error=${encodeURIComponent(messageErreurUtilisateur("anonymiserEmployeAction", error, "Impossible d’anonymiser cet employé."))}`);

  revalidatePath(`/employes/${employeId}`);
  revalidatePath("/employes");
  redirect(`/employes/${employeId}?message=${encodeURIComponent("Salarié anonymisé.")}`);
}
