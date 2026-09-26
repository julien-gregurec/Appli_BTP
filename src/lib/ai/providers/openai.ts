import OpenAI from "openai";
import type {
  AppelOutilIA,
  EvenementStreamIA,
  FichierIA,
  MessageIA,
  OutilIA,
  ProviderIA,
  ReponseCompletion,
  UsageIA,
} from "@/lib/ai/provider";

const MODELE_PAR_DEFAUT = "gpt-5.1";

// AI-LAUNCH-V1B : aucun timeout dedie n'existait avant ce lot (limite documentee dans
// AI_LAUNCH_V1.md). Pas de convention projet existante pour un appel externe de ce type
// (aucun autre appel HTTP sortant du code n'utilisait de timeout explicite non plus) ; valeur
// choisie dans la fourchette suggeree (15-30s) pour laisser le temps a une reponse avec
// plusieurs outils tout en bornant l'attente utilisateur sur une route streamee.
const TIMEOUT_MS = 25_000;

// Tarifs indicatifs (a confirmer avant activation Production reelle avec la grille tarifaire
// officielle du fournisseur pour le modele configure) : sert a estimer un cout HT par appel
// pour le journal_ia et le plafond budgetaire IA, pas a facturer directement le client.
const TARIF_PAR_MILLION_JETONS: Record<string, { entree: number; sortie: number }> = {
  "gpt-5.1": { entree: 1.25, sortie: 10 },
};
const TARIF_PAR_DEFAUT = { entree: 1.25, sortie: 10 };

function calculerCoutEstimeHT(modele: string, jetonsEntree: number, jetonsSortie: number): number {
  const tarif = TARIF_PAR_MILLION_JETONS[modele] ?? TARIF_PAR_DEFAUT;
  return (jetonsEntree * tarif.entree + jetonsSortie * tarif.sortie) / 1_000_000;
}

function extraireUsage(modele: string, usage: OpenAI.Responses.ResponseUsage | null | undefined): UsageIA | undefined {
  if (!usage) return undefined;
  return {
    jetonsEntree: usage.input_tokens,
    jetonsSortie: usage.output_tokens,
    jetonsTotal: usage.total_tokens,
    coutEstimeHT: calculerCoutEstimeHT(modele, usage.input_tokens, usage.output_tokens),
  };
}

function construireContenuFichier(fichier: FichierIA): OpenAI.Responses.ResponseInputContent {
  const estImage = fichier.mimeType.startsWith("image/");
  return estImage
    ? { type: "input_image", image_url: `data:${fichier.mimeType};base64,${fichier.base64}`, detail: "auto" }
    : { type: "input_file", file_data: `data:${fichier.mimeType};base64,${fichier.base64}`, filename: "piece-jointe.pdf" };
}

function construireInput(historique: MessageIA[]): OpenAI.Responses.ResponseInputItem[] {
  const items: OpenAI.Responses.ResponseInputItem[] = [];
  for (const message of historique) {
    if (message.role === "user") {
      if (message.fichier) {
        items.push({ role: "user", content: [construireContenuFichier(message.fichier), { type: "input_text", text: message.contenu || "Analyse ce fichier." }] });
      } else {
        items.push({ role: "user", content: message.contenu });
      }
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
        // RGPD : ne jamais laisser OpenAI conserver l'objet Response (30 jours par defaut) —
        // le provider reconstruit tout l'historique a chaque appel (construireInput), aucune
        // dependance a response_id/previous_response_id/retrieve — voir rgpd-sous-traitants.md.
        store: false,
      }, { timeout: TIMEOUT_MS });
      return { texte: response.output_text ?? "", appelsOutils: extraireAppelsOutils(response.output), usage: extraireUsage(modele, response.usage) };
    },

    async completerAvecFichier({ system, texte, fichier, maxTokens }) {
      const response = await client.responses.create({
        model: modele,
        instructions: system,
        input: [{ role: "user", content: [construireContenuFichier(fichier), { type: "input_text", text: texte }] }],
        max_output_tokens: maxTokens,
        store: false,
      }, { timeout: TIMEOUT_MS });
      return { texte: response.output_text ?? "", usage: extraireUsage(modele, response.usage) };
    },

    async *streamer({ system, historique, outils, maxTokens }): AsyncGenerator<EvenementStreamIA, ReponseCompletion> {
      const stream = await client.responses.create({
        model: modele,
        instructions: system,
        input: construireInput(historique),
        tools: outils?.map(convertirOutil),
        max_output_tokens: maxTokens,
        stream: true,
        store: false,
      }, { timeout: TIMEOUT_MS });

      const appelsOutils: AppelOutilIA[] = [];
      let texteFinal = "";
      let usage: UsageIA | undefined;
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
          usage = extraireUsage(modele, event.response.usage);
        }
      }
      return { texte: texteFinal, appelsOutils, usage };
    },
  };
}
