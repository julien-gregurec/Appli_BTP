import { obtenirProviderIA } from "@/lib/ai/provider";

export type MessageThread = { auteur: string; contenu: string; propre: boolean };

export async function suggererReponse(fil: MessageThread[]): Promise<string> {
  const provider = obtenirProviderIA();

  const filTexte = fil
    .map((m) => `${m.propre ? "Moi" : m.auteur} : ${m.contenu}`)
    .join("\n");

  const { texte } = await provider.completer({
    system:
      "Tu rédiges un brouillon de réponse pour l'utilisateur, dans une messagerie interne d'entreprise du BTP. " +
      "Réponds au dernier message du fil, dans le ton du reste de la conversation (professionnel mais direct, pas de formules ampoulées). " +
      "Réponds uniquement avec le texte du message à envoyer, sans guillemets ni introduction du type « Voici ». " +
      "Si le fil ne contient pas assez d'information pour répondre utilement, propose une question courte pour clarifier.",
    historique: [{ role: "user", contenu: `Fil de discussion :\n${filTexte}\n\nRédige la réponse de "Moi" au dernier message.` }],
    maxTokens: 500,
  });

  if (!texte.trim()) throw new Error("L'IA n'a pas pu proposer de réponse.");
  return texte.trim();
}
