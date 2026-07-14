"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

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
  if (error) redirect(`/aide?error=${encodeURIComponent(error.message)}`);

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
  if (error) redirect(`/plateforme/support?entreprise=${entrepriseId}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme/support");
  redirect(`/plateforme/support?entreprise=${entrepriseId}&envoye=1`);
}
