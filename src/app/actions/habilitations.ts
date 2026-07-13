"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

export async function ajouterHabilitationAction(employeId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const type = String(formData.get("type") ?? "autre");
  const libelle = String(formData.get("libelle") ?? "").trim() || null;
  const date_obtention = String(formData.get("date_obtention") ?? "").trim() || null;
  const date_expiration = String(formData.get("date_expiration") ?? "").trim() || null;

  const { error } = await supabase.from("habilitations_employe").insert({
    entreprise_id: ctx.entrepriseId,
    employe_id: employeId,
    type,
    libelle,
    date_obtention,
    date_expiration,
  });
  if (error) redirect(`/employes/${employeId}/carte?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/employes/${employeId}/carte`);
  redirect(`/employes/${employeId}/carte?succes=1`);
}

export async function supprimerHabilitationAction(id: string, employeId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  await supabase.from("habilitations_employe").delete().eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath(`/employes/${employeId}/carte`);
}
