import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { demanderAssistantIAStream, type MessageChat } from "@/lib/ai/assistant";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";
import { MIME_ANALYSABLES_IA } from "@/lib/ai/documents";

const TAILLE_MAX_PIECE_JOINTE_BASE64 = 8_000_000; // ~6 Mo de fichier une fois décodé

export async function POST(request: Request) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) {
    return Response.json({ error: "Ton poste n'a pas accès aux fonctionnalités IA." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { historique?: MessageChat[] } | null;
  const historique = body?.historique;
  const dernierMessage = historique?.at(-1);
  if (!Array.isArray(historique) || !dernierMessage || dernierMessage.role !== "user" || !dernierMessage.contenu.trim()) {
    return Response.json({ error: "Écris une question." }, { status: 400 });
  }
  if (historique.length > 30) {
    return Response.json({ error: "Conversation trop longue, démarre une nouvelle discussion." }, { status: 400 });
  }
  if (dernierMessage.fichier) {
    if (!MIME_ANALYSABLES_IA.includes(dernierMessage.fichier.mimeType)) {
      return Response.json({ error: "Format de pièce jointe non pris en charge (images JPEG/PNG/WebP ou PDF)." }, { status: 400 });
    }
    if (dernierMessage.fichier.base64.length > TAILLE_MAX_PIECE_JOINTE_BASE64) {
      return Response.json({ error: "Pièce jointe trop volumineuse (6 Mo maximum)." }, { status: 400 });
    }
  }

  const depassement = await verifierPlafondIA(supabase, ctx.entrepriseId);
  if (depassement) {
    return Response.json({ error: depassement }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const envoyer = (evenement: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(evenement)}\n\n`));
      try {
        for await (const evenement of demanderAssistantIAStream(supabase, ctx.entrepriseId, ctx.entrepriseNom, historique)) {
          envoyer(evenement);
        }
        envoyer({ type: "fin" });
        journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "assistant_chat", statut: "succes" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur de l'assistant IA.";
        envoyer({ type: "erreur", message });
        journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "assistant_chat", statut: "erreur", messageErreur: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
