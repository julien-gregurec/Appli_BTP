"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { suggererReponse, type MessageThread } from "@/lib/ai/messagerie";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";

function retour(type: "error" | "success", message: string, conversationId?: string): never {
  const query = new URLSearchParams({ [type]: message });
  if (conversationId) query.set("conversation", conversationId);
  redirect(`/messagerie?${query.toString()}`);
}

export async function creerConversationInterneAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const type = String(formData.get("type") ?? "directe");
  const cibleId = String(formData.get("cible_id") ?? "");
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!cibleId || !contenu) retour("error", "Choisissez un destinataire ou un chantier et saisissez un message");
  if (!['directe','chantier'].includes(type)) retour("error", "Type de conversation invalide");

  const { data: employe } = await supabase.from("employes").select("id")
    .eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  if (!employe) retour("error", "Votre compte doit être relié à une fiche employé active");

  let conversationId: string | null = null;
  if (type === "chantier") {
    const { data: existante } = await supabase.from("conversations_internes").select("id")
      .eq("entreprise_id", ctx.entrepriseId).eq("type", "chantier").eq("chantier_id", cibleId).maybeSingle();
    conversationId = existante?.id ?? null;
    if (!conversationId) {
      const { data, error } = await supabase.from("conversations_internes").insert({
        entreprise_id: ctx.entrepriseId, type: "chantier", chantier_id: cibleId,
        cree_par_employe_id: employe.id,
      }).select("id").single();
      if (error || !data) retour("error", error?.message ?? "Conversation impossible à créer");
      conversationId = data.id;
    }
  } else {
    const { data: conversations } = await supabase.from("conversations_internes")
      .select("id,cree_par_employe_id,destinataire_employe_id")
      .eq("entreprise_id", ctx.entrepriseId).eq("type", "directe");
    const existante = (conversations ?? []).find((conversation) =>
      (conversation.cree_par_employe_id === employe.id && conversation.destinataire_employe_id === cibleId)
      || (conversation.cree_par_employe_id === cibleId && conversation.destinataire_employe_id === employe.id));
    conversationId = existante?.id ?? null;
    if (!conversationId) {
      const { data, error } = await supabase.from("conversations_internes").insert({
        entreprise_id: ctx.entrepriseId, type: "directe", destinataire_employe_id: cibleId,
        cree_par_employe_id: employe.id,
      }).select("id").single();
      if (error || !data) retour("error", error?.message ?? "Conversation impossible à créer");
      conversationId = data.id;
    }
  }

  const { error } = await supabase.from("messages_internes").insert({
    entreprise_id: ctx.entrepriseId, conversation_id: conversationId,
    auteur_employe_id: employe.id, contenu,
  });
  if (error) retour("error", error.message);
  revalidatePath("/messagerie");
  retour("success", "Message envoyé", conversationId ?? undefined);
}

export async function envoyerMessageInterneAction(conversationId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!contenu) retour("error", "Saisissez un message", conversationId);
  const { data: employe } = await supabase.from("employes").select("id")
    .eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  if (!employe) retour("error", "Compte employé introuvable", conversationId);
  const { error } = await supabase.from("messages_internes").insert({
    entreprise_id: ctx.entrepriseId, conversation_id: conversationId,
    auteur_employe_id: employe.id, contenu,
  });
  if (error) retour("error", error.message, conversationId);
  revalidatePath("/messagerie");
  retour("success", "Message envoyé", conversationId);
}

export async function suggererReponseIAAction(conversationId: string): Promise<{ brouillon: string } | { error: string }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations_internes")
    .select("id")
    .eq("id", conversationId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!conversation) return { error: "Conversation introuvable." };

  const { data: employe } = await supabase
    .from("employes")
    .select("id")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("utilisateur_id", ctx.userId)
    .maybeSingle();
  if (!employe) return { error: "Compte employé introuvable." };

  const { data: messages } = await supabase
    .from("messages_internes")
    .select("contenu, auteur:employes(id, prenom, nom)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(15);
  if (!messages || messages.length === 0) return { error: "Pas encore de message dans cette conversation." };

  const fil: MessageThread[] = messages
    .slice()
    .reverse()
    .map((m) => {
      const auteur = (Array.isArray(m.auteur) ? m.auteur[0] : m.auteur) as { id: string; prenom: string; nom: string } | null;
      return {
        auteur: auteur ? `${auteur.prenom} ${auteur.nom}` : "Collaborateur",
        contenu: m.contenu,
        propre: auteur?.id === employe.id,
      };
    });

  if (fil.at(-1)?.propre) return { error: "Le dernier message est déjà le vôtre." };

  const depassement = await verifierPlafondIA(supabase, ctx.entrepriseId);
  if (depassement) return { error: depassement };

  try {
    const brouillon = await suggererReponse(fil);
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "messagerie", statut: "succes" });
    return { brouillon };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de la suggestion IA.";
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "messagerie", statut: "erreur", messageErreur: message });
    return { error: message };
  }
}
