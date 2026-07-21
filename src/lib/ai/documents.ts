import Anthropic from "@anthropic-ai/sdk";

const TYPES_IMAGE_SUPPORTES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type TypeImageSupporte = (typeof TYPES_IMAGE_SUPPORTES)[number];

export const MIME_ANALYSABLES_IA: readonly string[] = [...TYPES_IMAGE_SUPPORTES, "application/pdf"];

const PROMPT_PHOTO =
  "Tu es un assistant qui aide un chef de chantier BTP à relire une photo de chantier. " +
  "Décris en 3 à 6 puces courtes ce que tu observes d'utile pour le suivi : travaux visiblement inachevés ou mal finis, " +
  "anomalies (fissure, défaut d'aplomb, teinte différente, malfaçon apparente), absence d'équipements de protection individuelle " +
  "si des personnes sont visibles, et tout élément qui mériterait une vérification. " +
  "Si la photo ne montre rien d'anormal, dis-le simplement en une phrase. Ne décris pas la photo en détail, va à l'essentiel, en français.";

const PROMPT_DOCUMENT =
  "Tu es un assistant qui aide une entreprise du BTP à relire un document (devis, facture, plan ou pièce technique). " +
  "Résume en 3 à 6 puces courtes le contenu essentiel (nature du document, montants ou quantités clés, dates, parties concernées) " +
  "et signale toute incohérence ou erreur apparente (total qui ne correspond pas, date manquante, information contradictoire). " +
  "Réponds en français, va à l'essentiel, pas de titre.";

export async function analyserDocumentIA(donnees: Buffer, mimeType: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = donnees.toString("base64");

  const estImage = (TYPES_IMAGE_SUPPORTES as readonly string[]).includes(mimeType);
  const estPdf = mimeType === "application/pdf";
  if (!estImage && !estPdf) {
    throw new Error("Ce format de fichier n'est pas pris en charge par l'analyse IA (images JPEG/PNG/WebP ou PDF uniquement).");
  }

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          estImage
            ? { type: "image", source: { type: "base64", media_type: mimeType as TypeImageSupporte, data: base64 } }
            : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: estImage ? PROMPT_PHOTO : PROMPT_DOCUMENT },
        ],
      },
    ],
  });

  const texte = message.content.find((b) => b.type === "text");
  if (!texte || texte.type !== "text") throw new Error("L'IA n'a pas retourné d'analyse exploitable.");
  return texte.text;
}
