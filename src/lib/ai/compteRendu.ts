import { obtenirProviderIA } from "@/lib/ai/provider";

const OUTIL_STRUCTURER = {
  nom: "structurer_compte_rendu",
  description: "Structure une dictée orale de chantier en compte-rendu écrit propre.",
  parametres: {
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
  const provider = obtenirProviderIA();

  const { appelsOutils } = await provider.completer({
    system:
      "Tu structures la dictée orale d'un chef de chantier BTP en compte-rendu écrit clair, en français. " +
      "Reste fidèle à ce qui est dit : ne complète ni n'invente aucune information absente de la dictée.",
    outils: [OUTIL_STRUCTURER],
    forcerOutil: OUTIL_STRUCTURER.nom,
    historique: [{ role: "user", contenu: `Dictée à structurer :\n${transcription}` }],
    maxTokens: 1000,
  });

  const appel = appelsOutils.find((a) => a.nom === OUTIL_STRUCTURER.nom);
  if (!appel) throw new Error("L'IA n'a pas pu structurer ce compte-rendu.");

  const input = appel.entree as { titre?: string; contenu?: string };
  if (!input.contenu) throw new Error("L'IA n'a pas pu structurer ce compte-rendu.");
  return { titre: input.titre?.trim() || "Compte-rendu", contenu: input.contenu.trim() };
}
