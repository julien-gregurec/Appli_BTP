"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

// Un ou plusieurs ouvriers affectés à une tâche, une date et un nombre d'heures.
export async function creerAffectationAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const chantierId = champ(formData, "chantier_id");
  const employeIds = [...new Set(formData.getAll("employe_ids").map(String).filter(Boolean))];
  const date = champ(formData, "date");
  const heures = Number(formData.get("heures"));

  const retour = champ(formData, "retour");
  const destination = retour ? `/planning?semaine=${encodeURIComponent(retour)}` : "/planning";
  if (!chantierId || employeIds.length === 0 || !date) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Chantier, ouvriers et date obligatoires")}`);
  }
  if (!heures || heures <= 0) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Nombre d'heures invalide")}`);
  }
  const [{ data: chantier }, { data: employes }] = await Promise.all([
    supabase.from("chantiers").select("id").eq("id",chantierId).eq("entreprise_id",ctx.entrepriseId).maybeSingle(),
    supabase.from("employes").select("id").eq("entreprise_id",ctx.entrepriseId).eq("statut","actif").in("id",employeIds),
  ]);
  if (!chantier || (employes?.length ?? 0) !== employeIds.length) redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Chantier ou ouvrier invalide")}`);
  const tache = champ(formData,"tache");
  const { error } = await supabase.from("affectations").insert(employeIds.map((employeId) => ({ entreprise_id:ctx.entrepriseId,chantier_id:chantierId,employe_id:employeId,date,heures,tache })));

  if (error) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/planning");
  redirect(destination);
}

export async function supprimerAffectationAction(affectationId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  await supabase.from("affectations").delete().eq("id", affectationId).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/planning");
}

export async function supprimerGroupeAffectationsAction(formData:FormData){
  const ctx=await getContexteEntreprise();const supabase=await createClient();
  const ids=[...new Set(formData.getAll("ids").map(String).filter(Boolean))];const retour=champ(formData,"retour");
  if(ids.length) await supabase.from("affectations").delete().eq("entreprise_id",ctx.entrepriseId).in("id",ids);
  revalidatePath("/planning");redirect(retour?`/planning?semaine=${encodeURIComponent(retour)}`:"/planning");
}
