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

export async function enregistrerPresenceApplicationAction(installee: boolean) {
  if (isEmailLoginDisabled()) return;
  const supabase = await createClient();
  await supabase.rpc("enregistrer_presence_application", { p_installee: installee });
}
