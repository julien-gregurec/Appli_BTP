"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin } from "@/lib/plateforme";

export async function modifierAbonnementAction(entrepriseId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) {
    redirect("/dashboard");
  }
  const statut = String(formData.get("statut") ?? "essai");
  const echeance = String(formData.get("echeance") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    // Mode prototype : mise à jour directe (l'admin plateforme réel passe par la RPC).
    await supabase
      .from("entreprises")
      .update({ abonnement_statut: statut, abonnement_echeance: echeance, abonnement_note: note, updated_at: new Date().toISOString() })
      .eq("id", entrepriseId);
  } else {
    const { error } = await supabase.rpc("plateforme_modifier_abonnement", {
      p_entreprise_id: entrepriseId,
      p_statut: statut,
      p_echeance: echeance,
      p_note: note,
    });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/plateforme");
  redirect("/plateforme?succes=1");
}
