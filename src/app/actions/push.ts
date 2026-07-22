"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { TYPES_NOTIFICATIONS } from "@/lib/notifications-registre";

export async function enregistrerAbonnementPushAction(abonnement: { endpoint: string; p256dh: string; auth: string; appareil?: string }): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!abonnement.endpoint || !abonnement.p256dh || !abonnement.auth) return { error: "Abonnement push invalide." };
  const { error } = await supabase.from("push_abonnements").upsert(
    { entreprise_id: ctx.entrepriseId, utilisateur_id: ctx.userId, endpoint: abonnement.endpoint, p256dh: abonnement.p256dh, auth: abonnement.auth, appareil: abonnement.appareil ?? null },
    { onConflict: "endpoint" },
  );
  if (error) return { error: error.message };
  return { ok: true };
}

export async function supprimerAbonnementPushAction(endpoint: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.from("push_abonnements").delete().eq("endpoint", endpoint).eq("utilisateur_id", ctx.userId);
  if (error) return { error: error.message };
  return { ok: true };
}

const TYPES_AUTORISES = new Set(TYPES_NOTIFICATIONS.map((t) => t.cle));

export async function definirPreferenceNotificationAction(type: string, actif: boolean): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!TYPES_AUTORISES.has(type)) return { error: "Type de notification invalide." };
  const { error } = await supabase
    .from("preferences_notifications_push")
    .upsert({ entreprise_id: ctx.entrepriseId, utilisateur_id: ctx.userId, type, actif, updated_at: new Date().toISOString() }, { onConflict: "utilisateur_id,type" });
  if (error) return { error: error.message };
  revalidatePath("/parametres/notifications");
  return { ok: true };
}
