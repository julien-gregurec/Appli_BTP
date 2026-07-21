import Anthropic from "@anthropic-ai/sdk";

const OUTIL_STRUCTURER = {
  name: "structurer_compte_rendu",
  description: "Structure une dictée orale de chantier en compte-rendu écrit propre.",
  input_schema: {
    type: "object" as const,
    properties: {
      titre: { type: "string", description: "Titre court du compte-rendu (ex. « Journée du 21/07 — pose cloisons »)" },
      contenu: {
        type: "string",
        description:
          "Compte-rendu structuré en français, avec des puces courtes : tâches réalisées, effectifs présents, matériel/matériaux utilisés, points d'attention ou blocages. Ne rien inventer qui ne soit pas mentionné dans la dictée.",
      },
    },
    required: ["titre", "contenu"],
  },
};

export async function structurerCompteRendu(transcription: string): Promise<{ titre: string; contenu: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1000,
    system:
      "Tu structures la dictée orale d'un chef de chantier BTP en compte-rendu écrit clair, en français. " +
      "Reste fidèle à ce qui est dit : ne complète ni n'invente aucune information absente de la dictée.",
    tools: [OUTIL_STRUCTURER],
    tool_choice: { type: "tool", name: "structurer_compte_rendu" },
    messages: [{ role: "user", content: `Dictée à structurer :\n${transcription}` }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("L'IA n'a pas pu structurer ce compte-rendu.");

  const input = toolUse.input as { titre?: string; contenu?: string };
  if (!input.contenu) throw new Error("L'IA n'a pas pu structurer ce compte-rendu.");
  return { titre: input.titre?.trim() || "Compte-rendu", contenu: input.contenu.trim() };
}
