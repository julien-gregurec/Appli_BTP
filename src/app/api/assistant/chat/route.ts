import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { demanderAssistantIAStream, type MessageChat } from "@/lib/ai/assistant";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";
import { TAILLE_MAX_CORPS_ASSISTANT, validerRequeteAssistant } from "@/lib/ai/validation";
import { erreurPublique, verifierTailleRequete } from "@/lib/security/validation";
import { iaEstActive, MESSAGE_IA_INDISPONIBLE } from "@/lib/preview-features";

// Plafond dedie a cette route : ne pas reutiliser un plafond generique de petite route
// JSON, la piece jointe encodee en base64 (jusqu'a 6 Mo reels) ne rentrerait pas dedans.
// Voir src/lib/ai/validation.ts pour le detail du calcul.
async function lireJsonBorne(request: Request) {
  if (!verifierTailleRequete(request.headers, TAILLE_MAX_CORPS_ASSISTANT)) return { tropVolumineux: true as const };
  const lecteur = request.body?.getReader();
  if (!lecteur) return { valeur: null, tropVolumineux: false as const };
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    taille += value.byteLength;
    if (taille > TAILLE_MAX_CORPS_ASSISTANT) {
      await lecteur.cancel();
      return { tropVolumineux: true as const };
    }
    morceaux.push(value);
  }
  const corps = new Uint8Array(taille);
  let position = 0;
  for (const morceau of morceaux) {
    corps.set(morceau, position);
    position += morceau.byteLength;
  }
  try {
    return { valeur: JSON.parse(new TextDecoder().decode(corps)), tropVolumineux: false as const };
  } catch {
    return { valeur: null, tropVolumineux: false as const };
  }
}

export async function POST(request: Request) {
  if (!iaEstActive()) return Response.json({ error: MESSAGE_IA_INDISPONIBLE }, { status: 404 });
  const corps = await lireJsonBorne(request);
  if (corps.tropVolumineux) {
    return Response.json({ error: "Requête trop volumineuse." }, { status: 413 });
  }
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!aAccesIA(permissions)) {
    return Response.json({ error: "Ton poste n'a pas accès aux fonctionnalités IA." }, { status: 403 });
  }
  const peutGererPlanning = permissions === null || permissions.includes("gerer_planning");

  const body = corps.valeur as { historique?: MessageChat[] } | null;
  const historique = body?.historique;
  const validation = validerRequeteAssistant(historique);
  if (!validation.ok) {
    return Response.json({ error: validation.message }, { status: validation.statut });
  }
  // validerRequeteAssistant a deja verifie qu'il s'agit d'un tableau de MessageChat valide.
  const historiqueValide = historique as MessageChat[];

  const depassement = await verifierPlafondIA(supabase, ctx.entrepriseId);
  if (depassement) {
    return Response.json({ error: depassement }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const envoyer = (evenement: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(evenement)}\n\n`));
      try {
        for await (const evenement of demanderAssistantIAStream(supabase, ctx.entrepriseId, ctx.entrepriseNom, ctx.userId, ctx.prenom, peutGererPlanning, permissions, historiqueValide)) {
          envoyer(evenement);
        }
        envoyer({ type: "fin" });
        journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "assistant_chat", statut: "succes" });
      } catch (err) {
        const messageInterne = err instanceof Error ? err.message : "Erreur de l'assistant IA.";
        envoyer({ type: "erreur", message: erreurPublique(err, "L'assistant est temporairement indisponible.") });
        journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "assistant_chat", statut: "erreur", messageErreur: messageInterne });
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
