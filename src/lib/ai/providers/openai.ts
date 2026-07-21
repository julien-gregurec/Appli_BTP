import OpenAI from "openai";
import type {
  AppelOutilIA,
  EvenementStreamIA,
  MessageIA,
  OutilIA,
  ProviderIA,
  ReponseCompletion,
} from "@/lib/ai/provider";

const MODELE_PAR_DEFAUT = "gpt-5.1";

function construireInput(historique: MessageIA[]): OpenAI.Responses.ResponseInputItem[] {
  const items: OpenAI.Responses.ResponseInputItem[] = [];
  for (const message of historique) {
    if (message.role === "user") {
      items.push({ role: "user", content: message.contenu });
    } else if (message.role === "assistant") {
      if (message.contenu) items.push({ role: "assistant", content: message.contenu });
      for (const appel of message.appelsOutils ?? []) {
        items.push({ type: "function_call", call_id: appel.id, name: appel.nom, arguments: JSON.stringify(appel.entree) });
      }
    } else {
      items.push({ type: "function_call_output", call_id: message.appelId, output: message.resultat });
    }
  }
  return items;
}

function convertirOutil(outil: OutilIA): OpenAI.Responses.FunctionTool {
  return { type: "function", name: outil.nom, description: outil.description, parameters: outil.parametres, strict: false };
}

function extraireAppelsOutils(items: OpenAI.Responses.ResponseOutputItem[]): AppelOutilIA[] {
  const appels: AppelOutilIA[] = [];
  for (const item of items) {
    if (item.type === "function_call") {
      let entree: Record<string, unknown> = {};
      try {
        entree = JSON.parse(item.arguments || "{}");
      } catch {
        entree = {};
      }
      appels.push({ id: item.call_id, nom: item.name, entree });
    }
  }
  return appels;
}

export function creerProviderOpenAI(): ProviderIA {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const modele = process.env.OPENAI_MODEL || MODELE_PAR_DEFAUT;

  return {
    async completer({ system, historique, outils, forcerOutil, maxTokens }): Promise<ReponseCompletion> {
      const response = await client.responses.create({
        model: modele,
        instructions: system,
        input: construireInput(historique),
        tools: outils?.map(convertirOutil),
        tool_choice: forcerOutil ? { type: "function", name: forcerOutil } : undefined,
        max_output_tokens: maxTokens,
      });
      return { texte: response.output_text ?? "", appelsOutils: extraireAppelsOutils(response.output) };
    },

    async completerAvecFichier({ system, texte, fichier, maxTokens }): Promise<string> {
      const estImage = fichier.mimeType.startsWith("image/");
      const contenuFichier: OpenAI.Responses.ResponseInputContent = estImage
        ? { type: "input_image", image_url: `data:${fichier.mimeType};base64,${fichier.base64}`, detail: "auto" }
        : { type: "input_file", file_data: `data:${fichier.mimeType};base64,${fichier.base64}`, filename: "document.pdf" };
      const response = await client.responses.create({
        model: modele,
        instructions: system,
        input: [{ role: "user", content: [contenuFichier, { type: "input_text", text: texte }] }],
        max_output_tokens: maxTokens,
      });
      return response.output_text ?? "";
    },

    async *streamer({ system, historique, outils, maxTokens }): AsyncGenerator<EvenementStreamIA, ReponseCompletion> {
      const stream = await client.responses.create({
        model: modele,
        instructions: system,
        input: construireInput(historique),
        tools: outils?.map(convertirOutil),
        max_output_tokens: maxTokens,
        stream: true,
      });

      const appelsOutils: AppelOutilIA[] = [];
      let texteFinal = "";
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          yield { type: "texte", delta: event.delta };
        } else if (event.type === "response.output_item.done" && event.item.type === "function_call") {
          let entree: Record<string, unknown> = {};
          try {
            entree = JSON.parse(event.item.arguments || "{}");
          } catch {
            entree = {};
          }
          const appel: AppelOutilIA = { id: event.item.call_id, nom: event.item.name, entree };
          appelsOutils.push(appel);
          yield { type: "appel_outil", appel };
        } else if (event.type === "response.completed") {
          texteFinal = event.response.output_text ?? "";
        }
      }
      return { texte: texteFinal, appelsOutils };
    },
  };
}
