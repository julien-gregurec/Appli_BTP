"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { notifierReponseSupport } from "@/lib/support-notifications";

type ClientSupabase = Awaited<ReturnType<typeof createClient>>;

type DestinataireReponseSupport = {
  email: string | null;
  prenom: string | null;
  nom: string | null;
  entreprise_nom: string | null;
  demande: string | null;
};

// Notification e-mail du demandeur : purement informative, jamais bloquante.
// La réponse support est déjà enregistrée quand on arrive ici — une panne Brevo,
// une adresse introuvable ou une session support expirée ne doivent pas la
// remettre en cause. Un appel = une réponse insérée = au plus un e-mail.
async function notifierReponseSupportSansEchouer(supabase: ClientSupabase, entrepriseId: string, reponse: string) {
  try {
    const { data, error } = await supabase.rpc("plateforme_support_destinataire_reponse", {
      p_entreprise_id: entrepriseId,
    });
    if (error) {
      console.warn("Notification réponse support non envoyée", { categorie: "destinataire_illisible" });
      return;
    }
    const cible = (Array.isArray(data) ? data[0] : data) as DestinataireReponseSupport | null | undefined;
    if (!cible?.email) {
      // Aucune adresse fiable rattachée au demandeur : on n'en reconstruit pas.
      console.warn("Notification réponse support non envoyée", { categorie: "destinataire_absent" });
      return;
    }
    await notifierReponseSupport({
      destinataire: cible.email,
      prenom: cible.prenom,
      nom: cible.nom,
      entrepriseId,
      entrepriseNom: cible.entreprise_nom,
      demande: cible.demande,
      reponse,
    });
  } catch {
    console.warn("Notification réponse support non envoyée", { categorie: "preparation_impossible" });
  }
}

// Côté entreprise : envoyer un message au support plateforme.
export async function envoyerMessageSupportAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const entrepriseId = ctx.entrepriseId;
  if (!entrepriseId) redirect("/onboarding");
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!contenu) redirect("/aide");

  const supabase = await createClient();
  const { error } = await supabase.rpc("support_envoyer_message_entreprise", {
    p_entreprise_id: entrepriseId,
    p_contenu: contenu,
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
  await notifierReponseSupportSansEchouer(supabase, entrepriseId, contenu);
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
