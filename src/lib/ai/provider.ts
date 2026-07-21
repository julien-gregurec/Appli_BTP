import { creerProviderOpenAI } from "@/lib/ai/providers/openai";

export type MessageIA =
  | { role: "user"; contenu: string }
  | { role: "assistant"; contenu: string; appelsOutils?: AppelOutilIA[] }
  | { role: "outil"; appelId: string; resultat: string };

export type AppelOutilIA = { id: string; nom: string; entree: Record<string, unknown> };

export type OutilIA = { nom: string; description: string; parametres: Record<string, unknown> };

export type ReponseCompletion = { texte: string; appelsOutils: AppelOutilIA[] };

export type EvenementStreamIA =
  | { type: "texte"; delta: string }
  | { type: "appel_outil"; appel: AppelOutilIA };

export type FichierIA = { base64: string; mimeType: string };

export interface ProviderIA {
  /** Complétion simple ou multi-tours, avec outils optionnels (auto ou forcés). */
  completer(params: {
    system?: string;
    historique: MessageIA[];
    outils?: OutilIA[];
    forcerOutil?: string;
    maxTokens?: number;
  }): Promise<ReponseCompletion>;

  /** Complétion à partir d'une image ou d'un document (PDF), sans outils. */
  completerAvecFichier(params: {
    system?: string;
    texte: string;
    fichier: FichierIA;
    maxTokens?: number;
  }): Promise<string>;

  /** Variante streamée de `completer`, pour affichage progressif dans le chat. */
  streamer(params: {
    system?: string;
    historique: MessageIA[];
    outils?: OutilIA[];
    maxTokens?: number;
  }): AsyncGenerator<EvenementStreamIA, ReponseCompletion>;
}

// Point d'extension unique : un futur providers/anthropic.ts ou providers/gemini.ts
// n'implique aucun changement dans lib/ai/*.ts, seulement ce switch.
export function obtenirProviderIA(): ProviderIA {
  return creerProviderOpenAI();
}
