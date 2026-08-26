"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

// Côté entreprise : envoyer un message au support plateforme.
export async function envoyerMessageSupportAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const entrepriseId = ctx.entrepriseId;
  if (!entrepriseId) redirect("/onboarding");
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!contenu) redirect("/aide");

  const supabase = await createClient();
  const { error } = await supabase.from("support_messages").insert({
    entreprise_id: entrepriseId,
    cote: "entreprise",
    auteur_id: ctx.userId,
    auteur_nom: [ctx.prenom, ctx.entrepriseNom].filter(Boolean).join(" · ") || "Entreprise",
    contenu,
  });
  if (error) redirect(`/aide?error=${encodeURIComponent(messageErreurUtilisateur("envoyerMessageSupportAction", error, "Impossible d’envoyer votre message pour le moment."))}`);

  revalidatePath("/aide");
  redirect("/aide?envoye=1");
}

// Côté plateforme : répondre à une entreprise.
export async function repondreSupportPlateformeAction(entrepriseId: string, formData: FormData) {
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!entrepriseId || !contenu) redirect("/plateforme/support");
  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_support_repondre", {
    p_entreprise_id: entrepriseId,
    p_contenu: contenu,
  });
  if (error) redirect(`/plateforme/support?entreprise=${entrepriseId}&error=${encodeURIComponent(messageErreurUtilisateur("repondreSupportPlateformeAction", error, "Impossible d’envoyer la réponse."))}`);
  revalidatePath("/plateforme/support");
  redirect(`/plateforme/support?entreprise=${entrepriseId}&envoye=1`);
}

// Mutation explicite : consulter un fil ne modifie jamais son état de lecture.
export async function marquerMessagesSupportLusAction(entrepriseId: string) {
  if (!entrepriseId) redirect("/plateforme/support");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plateforme_support_marquer_messages_lus", {
    p_entreprise_id: entrepriseId,
  });
  if (error) {
    redirect(`/plateforme/support?entreprise=${entrepriseId}&error=${encodeURIComponent(messageErreurUtilisateur("marquerMessagesSupportLusAction", error, "Impossible de marquer les messages comme lus."))}`);
  }
  revalidatePath("/plateforme/support");
  redirect(`/plateforme/support?entreprise=${entrepriseId}&lus=${encodeURIComponent(String(data ?? 0))}`);
}
