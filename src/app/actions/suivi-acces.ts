"use server";

import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";

export async function marquerInvitationEmployeAction(employeId: string, canal: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.rpc("marquer_invitation_employe", { p_entreprise_id: ctx.entrepriseId, p_employe_id: employeId, p_canal: canal });
  if (error) return { error: error.message };
  revalidatePath("/employes");
  revalidatePath(`/employes/${employeId}`);
  return { ok: true };
}

export async function enregistrerPresenceApplicationAction(installee: boolean,appareil?:{id:string;nom:string;type:"ordinateur"|"telephone"|"tablette"|"autre"}) {
  if (isEmailLoginDisabled()) return;
  const ctx=await getContexteEntreprise();
  const supabase = await createClient();
  if(appareil?.id){
    const{error}=await supabase.rpc("enregistrer_appareil_courant",{p_entreprise_id:ctx.entrepriseId,p_identifiant_appareil:appareil.id,p_nom_appareil:appareil.nom,p_type_appareil:appareil.type,p_application_installee:installee});
    if(!error)return;
  }
  await supabase.rpc("enregistrer_presence_application", { p_installee: installee });
}
