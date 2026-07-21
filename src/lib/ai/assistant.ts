import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenirProviderIA, type FichierIA, type MessageIA, type ReponseCompletion } from "@/lib/ai/provider";
import { OUTILS_COPILOTE, executerOutilCopilote } from "@/lib/ai/copilote";

export type MessageChat = { role: "user" | "assistant"; contenu: string; fichier?: FichierIA };

export type PropositionAffectation = {
  employeId: string;
  employeNom: string;
  chantierId: string;
  chantierNom: string;
  date: string;
  heures: number;
  tache: string | null;
};

export type EvenementAssistant =
  | { type: "texte"; delta: string }
  | { type: "proposition"; proposition: PropositionAffectation };

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

/**
 * Boucle agentique streamée : émet les morceaux de texte au fil de l'eau, exécute les
 * outils de lecture, et s'arrête dès que l'IA appelle `proposer_affectation` (jamais
 * d'écriture en base directe — la proposition est renvoyée pour validation manuelle).
 */
async function decrireUtilisateurCourant(supabase: SupabaseClient, entrepriseId: string, utilisateurId: string): Promise<string> {
  const { data: employe } = await supabase
    .from("employes")
    .select("nom, prenom, poste")
    .eq("entreprise_id", entrepriseId)
    .eq("utilisateur_id", utilisateurId)
    .maybeSingle();
  if (employe) {
    return `Tu parles avec ${employe.prenom} ${employe.nom} (poste : ${employe.poste}). ` + `Cette personne EST cet employé : ne lui demande jamais son identité, tu la connais déjà. `;
  }
  return (
    `La personne à qui tu parles n'a pas encore de fiche employé liée à son compte. ` +
    `Si la question porte sur son propre planning, pointage, congés ou notes de frais, indique-lui d'aller dans "Mon espace" puis de cliquer sur "Créer ma fiche employé". `
  );
}

export async function* demanderAssistantIAStream(
  supabase: SupabaseClient,
  entrepriseId: string,
  entrepriseNom: string,
  utilisateurId: string,
  historique: MessageChat[],
): AsyncGenerator<EvenementAssistant, void, unknown> {
  const provider = obtenirProviderIA();
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date());
  const descriptionUtilisateur = await decrireUtilisateurCourant(supabase, entrepriseId, utilisateurId);

  const system =
    `Tu es l'assistant intégré de Liria Gestion Pro, un logiciel de gestion pour entreprises du BTP, pour l'entreprise "${entrepriseNom}". ` +
    `Nous sommes le ${aujourdhui}. ${descriptionUtilisateur}` +
    `Réponds en français, de façon concise et directe, comme un collègue qui connaît bien l'activité. ` +
    `Utilise systématiquement les outils à ta disposition pour aller chercher les données réelles avant de répondre — ne devine et n'invente jamais un chiffre ou un nom. ` +
    `Si aucun outil ne permet de répondre à la question, dis-le clairement plutôt que d'inventer une réponse. ` +
    `Pour toute demande d'affectation planning, utilise chercher_employe, chercher_chantier_planning puis verifier_disponibilite_employe avant de conclure avec proposer_affectation — ` +
    `tu ne crées jamais d'affectation toi-même, tu ne fais que la proposer ; l'utilisateur valide ou non. ` +
    `Formate tes réponses avec des tirets courts, pas de tableaux markdown, pas de titres.`;

  const conversation: MessageIA[] = historique.map((m) =>
    m.role === "user" ? { role: "user", contenu: m.contenu, fichier: m.fichier } : { role: "assistant", contenu: m.contenu },
  );

  for (let tour = 0; tour < MAX_TOURS_OUTILS; tour++) {
    const flux = provider.streamer({ system, historique: conversation, outils: OUTILS_COPILOTE, maxTokens: 1500 });
    let texteTour = "";
    let resultat: ReponseCompletion = { texte: "", appelsOutils: [] };
    while (true) {
      const { value, done } = await flux.next();
      if (done) {
        resultat = value;
        break;
      }
      if (value.type === "texte") {
        texteTour += value.delta;
        yield { type: "texte", delta: value.delta };
      }
    }

    if (resultat.appelsOutils.length === 0) return;

    const appelFinal = resultat.appelsOutils.find((a) => a.nom === "proposer_affectation");
    if (appelFinal) {
      const proposition = await resoudrePropositionAffectation(supabase, entrepriseId, appelFinal.entree);
      if (proposition) {
        yield { type: "proposition", proposition };
      } else {
        const message = "\n\nJe n'ai pas pu identifier précisément l'employé ou le chantier, peux-tu préciser ?";
        yield { type: "texte", delta: message };
      }
      return;
    }

    conversation.push({ role: "assistant", contenu: texteTour, appelsOutils: resultat.appelsOutils });
    for (const appel of resultat.appelsOutils) {
      const resultatOutil = await executerOutilCopilote(supabase, entrepriseId, appel.nom, appel.entree);
      conversation.push({ role: "outil", appelId: appel.id, resultat: JSON.stringify(resultatOutil) });
    }
  }

  yield { type: "texte", delta: "\n\nJe n'arrive pas à te répondre pour l'instant : reformule ta question plus précisément." };
}
