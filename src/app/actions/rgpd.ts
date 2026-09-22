"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
//
// `anonymiser_employe` (RPC) vide déjà les colonnes personnelles de `employes`, y compris
// les CHEMINS de stockage (photo_storage_path, signature_storage_path,
// carte_btp_storage_path) — mais elle ne peut pas supprimer les FICHIERS eux-mêmes dans
// Storage (SQL pur, pas d'accès à l'API Storage). Le fichier restait donc orphelin dans le
// bucket `documents-employes`, toujours récupérable avec son chemin exact, alors que l'UI
// affirme "effacées définitivement". On capture les chemins AVANT l'appel RPC (qui les met
// à null), puis on supprime les fichiers correspondants une fois l'anonymisation en base
// confirmée.
export async function anonymiserEmployeAction(formData: FormData) {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) redirect("/onboarding");

  const employeId = String(formData.get("employe_id") ?? "");
  if (!employeId) redirect("/employes");

  const supabase = await createClient();
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
  if (error) redirect(`/employes/${employeId}?error=${encodeURIComponent(messageErreurUtilisateur("anonymiserEmployeAction", error, "Impossible d’anonymiser cet employé."))}`);

  const cheminsFichiers = [employe?.photo_storage_path, employe?.signature_storage_path, employe?.carte_btp_storage_path].filter(
    (chemin): chemin is string => typeof chemin === "string" && chemin.length > 0,
  );
  if (cheminsFichiers.length > 0) {
    // L'anonymisation en base a déjà réussi à ce stade : un échec de suppression Storage
    // (best effort, journalisé côté serveur) ne doit jamais faire annuler l'effacement des
    // données personnelles déjà acquis.
    const { error: erreurStorage } = await createAdminClient().storage.from("documents-employes").remove(cheminsFichiers);
    if (erreurStorage) console.error("anonymiserEmployeAction: suppression Storage échouée", erreurStorage);
  }

  revalidatePath(`/employes/${employeId}`);
  revalidatePath("/employes");
  redirect(`/employes/${employeId}?message=${encodeURIComponent("Salarié anonymisé.")}`);
}
