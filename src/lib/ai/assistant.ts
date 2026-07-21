import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OUTILS_COPILOTE, executerOutilCopilote } from "@/lib/ai/copilote";

export type MessageChat = { role: "user" | "assistant"; contenu: string };

const MAX_TOURS_OUTILS = 5;

export async function demanderAssistantIA(
  supabase: SupabaseClient,
  entrepriseId: string,
  entrepriseNom: string,
  historique: MessageChat[],
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date());

  const system =
    `Tu es l'assistant intégré de Liria Gestion Pro, un logiciel de gestion pour entreprises du BTP, pour l'entreprise "${entrepriseNom}". ` +
    `Nous sommes le ${aujourdhui}. Réponds en français, de façon concise et directe, comme un collègue qui connaît bien l'activité. ` +
    `Utilise systématiquement les outils à ta disposition pour aller chercher les données réelles avant de répondre — ne devine et n'invente jamais un chiffre ou un nom. ` +
    `Si aucun outil ne permet de répondre à la question, dis-le clairement plutôt que d'inventer une réponse. ` +
    `Formate tes réponses avec des tirets courts, pas de tableaux markdown, pas de titres.`;

  const messages: Anthropic.MessageParam[] = historique.map((m) => ({ role: m.role, content: m.contenu }));

  for (let tour = 0; tour < MAX_TOURS_OUTILS; tour++) {
    const reponse = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system,
      tools: OUTILS_COPILOTE,
      messages,
    });

    const appelsOutils = reponse.content.filter((b) => b.type === "tool_use");
    if (appelsOutils.length === 0) {
      const texte = reponse.content.find((b) => b.type === "text");
      return texte && texte.type === "text" ? texte.text : "Je n'ai pas de réponse à te proposer.";
    }

    messages.push({ role: "assistant", content: reponse.content });
    const resultats: Anthropic.ToolResultBlockParam[] = [];
    for (const appel of appelsOutils) {
      const resultat = await executerOutilCopilote(supabase, entrepriseId, appel.name, appel.input as Record<string, unknown>);
      resultats.push({ type: "tool_result", tool_use_id: appel.id, content: JSON.stringify(resultat) });
    }
    messages.push({ role: "user", content: resultats });
  }

  return "Je n'arrive pas à te répondre pour l'instant : reformule ta question plus précisément.";
}
