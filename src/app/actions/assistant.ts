"use server";

import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { demanderAssistantIA, type MessageChat } from "@/lib/ai/assistant";

export async function demanderAssistantIAAction(historique: MessageChat[]) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const dernierMessage = historique.at(-1);
  if (!dernierMessage || dernierMessage.role !== "user" || !dernierMessage.contenu.trim()) {
    return { error: "Écris une question." };
  }
  if (historique.length > 30) {
    return { error: "Conversation trop longue, démarre une nouvelle discussion." };
  }

  try {
    const reponse = await demanderAssistantIA(supabase, ctx.entrepriseId, ctx.entrepriseNom, historique);
    return { reponse };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur de l'assistant IA." };
  }
}
