"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

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
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?message=${encodeURIComponent("Demande de suppression enregistrée.")}`);
}

export async function annulerSuppressionAction() {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const supabase = await createClient();
  const { error } = await supabase.rpc("annuler_suppression_entreprise", { p_entreprise_id: entrepriseId });
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?message=${encodeURIComponent("Demande de suppression annulée.")}`);
}

// Confirmation forte de la purge définitive (après le délai de 30 jours) :
// re-saisie du nom de l'entreprise, comme la demande initiale.
export async function confirmerPurgeAction(formData: FormData) {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const nomAttendu = String(formData.get("nom_entreprise") ?? "").trim();
  if (!confirmation || confirmation.toLowerCase() !== nomAttendu.toLowerCase()) {
    redirect(`${PAGE}?error=${encodeURIComponent("Le nom saisi ne correspond pas au nom de l'entreprise.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmer_purge_entreprise", { p_entreprise_id: entrepriseId, p_confirmation_nom: confirmation });
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?message=${encodeURIComponent("Purge définitive confirmée : les données opérationnelles ont été supprimées, les données comptables/sociales entrent en conservation légale.")}`);
}

export async function poserLegalHoldAction(formData: FormData) {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const motif = String(formData.get("motif") ?? "").trim();
  const politiqueCle = String(formData.get("politique_cle") ?? "").trim() || null;
  if (!motif) redirect(`${PAGE}?error=${encodeURIComponent("Un motif est requis pour poser une réserve légale.")}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("poser_legal_hold_entreprise", { p_entreprise_id: entrepriseId, p_politique_cle: politiqueCle, p_motif: motif });
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?message=${encodeURIComponent("Réserve légale posée : la purge est bloquée tant qu'elle est active.")}`);
}

export async function leverLegalHoldAction(formData: FormData) {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const holdId = String(formData.get("hold_id") ?? "");
  if (!holdId) redirect(PAGE);

  const supabase = await createClient();
  const { error } = await supabase.rpc("lever_legal_hold_entreprise", { p_hold_id: holdId });
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?message=${encodeURIComponent("Réserve légale levée.")}`);
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
  if (error) redirect(`/employes/${employeId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/employes/${employeId}`);
  revalidatePath("/employes");
  redirect(`/employes/${employeId}?message=${encodeURIComponent("Salarié anonymisé.")}`);
}
