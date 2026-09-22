"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { cheminsStorageEmployeAAnonymiser } from "@/lib/rgpd";

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

// Anonymisation d'un salarié (droit à l'effacement d'une personne).
export async function anonymiserEmployeAction(formData: FormData) {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const employeId = String(formData.get("employe_id") ?? "");
  if (!employeId) redirect("/employes");

  const supabase = await createClient();

  // Récupère les chemins Storage AVANT anonymisation : la RPC vide ces colonnes en base,
  // donc c'est le seul moment où on peut encore retrouver les fichiers à supprimer.
  const { data: employe } = await supabase
    .from("employes")
    .select("photo_storage_path, signature_storage_path, carte_btp_storage_path")
    .eq("id", employeId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  const { error } = await supabase.rpc("anonymiser_employe", {
    p_entreprise_id: entrepriseId,
    p_employe_id: employeId,
  });
  if (error) redirect(`/employes/${employeId}?error=${encodeURIComponent(error.message)}`);

  // Purge réelle des fichiers (photo, signature, carte BTP) : sans cela, l'anonymisation
  // vide les colonnes en base mais laisse les fichiers, toujours nominatifs, orphelins
  // dans le bucket « documents-employes ». Best-effort : la donnée en base est déjà
  // anonymisée, on ne bloque pas l'action sur un échec de suppression de fichier.
  const chemins = cheminsStorageEmployeAAnonymiser(employe);
  if (chemins.length > 0) {
    await supabase.storage.from("documents-employes").remove(chemins);
  }

  revalidatePath(`/employes/${employeId}`);
  revalidatePath("/employes");
  redirect(`/employes/${employeId}?message=${encodeURIComponent("Salarié anonymisé.")}`);
}
