import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OUTILS_COPILOTE, executerOutilCopilote } from "@/lib/ai/copilote";

export type MessageChat = { role: "user" | "assistant"; contenu: string };

export type PropositionAffectation = {
  employeId: string;
  employeNom: string;
  chantierId: string;
  chantierNom: string;
  date: string;
  heures: number;
  tache: string | null;
};

export type ReponseAssistant = {
  texte: string;
  proposition?: PropositionAffectation;
};

const MAX_TOURS_OUTILS = 5;

async function resoudrePropositionAffectation(
  supabase: SupabaseClient,
  entrepriseId: string,
  input: Record<string, unknown>,
): Promise<PropositionAffectation | null> {
  const employeId = String(input.employe_id ?? "");
  const chantierId = String(input.chantier_id ?? "");
  const date = String(input.date ?? "");
  const heures = Number(input.heures);
  if (!employeId || !chantierId || !date || !heures || heures <= 0) return null;

  const [{ data: employe }, { data: chantier }] = await Promise.all([
    supabase.from("employes").select("nom, prenom").eq("id", employeId).eq("entreprise_id", entrepriseId).maybeSingle(),
    supabase.from("chantiers").select("nom").eq("id", chantierId).eq("entreprise_id", entrepriseId).maybeSingle(),
  ]);
  if (!employe || !chantier) return null;

  return {
    employeId,
    employeNom: `${employe.prenom} ${employe.nom}`,
    chantierId,
    chantierNom: chantier.nom,
    date,
    heures,
    tache: typeof input.tache === "string" && input.tache.trim() ? input.tache.trim() : null,
  };
}

export async function demanderAssistantIA(
  supabase: SupabaseClient,
  entrepriseId: string,
  entrepriseNom: string,
  historique: MessageChat[],
): Promise<ReponseAssistant> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date());

  const system =
    `Tu es l'assistant intégré de Liria Gestion Pro, un logiciel de gestion pour entreprises du BTP, pour l'entreprise "${entrepriseNom}". ` +
    `Nous sommes le ${aujourdhui}. Réponds en français, de façon concise et directe, comme un collègue qui connaît bien l'activité. ` +
    `Utilise systématiquement les outils à ta disposition pour aller chercher les données réelles avant de répondre — ne devine et n'invente jamais un chiffre ou un nom. ` +
    `Si aucun outil ne permet de répondre à la question, dis-le clairement plutôt que d'inventer une réponse. ` +
    `Pour toute demande d'affectation planning, utilise chercher_employe, chercher_chantier_planning puis verifier_disponibilite_employe avant de conclure avec proposer_affectation — ` +
    `tu ne crées jamais d'affectation toi-même, tu ne fais que la proposer ; l'utilisateur valide ou non. ` +
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
    const texteReponse = reponse.content.find((b) => b.type === "text");
    const texte = texteReponse && texteReponse.type === "text" ? texteReponse.text : "";

    const appelProposition = appelsOutils.find((a) => a.name === "proposer_affectation");
    if (appelProposition) {
      const proposition = await resoudrePropositionAffectation(supabase, entrepriseId, appelProposition.input as Record<string, unknown>);
      const commentaire = typeof (appelProposition.input as Record<string, unknown>).commentaire === "string" ? ((appelProposition.input as Record<string, unknown>).commentaire as string) : texte;
      if (proposition) return { texte: commentaire || "Voici ce que je te propose :", proposition };
      return { texte: "Je n'ai pas pu identifier précisément l'employé ou le chantier, peux-tu préciser ?" };
    }

    if (appelsOutils.length === 0) {
      return { texte: texte || "Je n'ai pas de réponse à te proposer." };
    }

    messages.push({ role: "assistant", content: reponse.content });
    const resultats: Anthropic.ToolResultBlockParam[] = [];
    for (const appel of appelsOutils) {
      const resultat = await executerOutilCopilote(supabase, entrepriseId, appel.name, appel.input as Record<string, unknown>);
      resultats.push({ type: "tool_result", tool_use_id: appel.id, content: JSON.stringify(resultat) });
    }
    messages.push({ role: "user", content: resultats });
  }

  return { texte: "Je n'arrive pas à te répondre pour l'instant : reformule ta question plus précisément." };
}
