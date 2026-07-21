import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenirProviderIA, type FichierIA, type MessageIA, type ReponseCompletion } from "@/lib/ai/provider";
import { OUTILS_COPILOTE, executerOutilCopilote } from "@/lib/ai/copilote";

export type MessageChat = { role: "user" | "assistant"; contenu: string; fichier?: FichierIA };

// Doit rester synchronise avec la liste dans src/app/actions/planning.ts (formulaire manuel) —
// "conge" est volontairement exclu ici : ces lignes sont creees par le workflow de demandes de
// conges (validation dediee), jamais proposees directement par l'assistant.
export const TYPES_ACTIVITE_PROPOSABLES_IA = ["chantier", "bureau", "depot", "visite_medicale", "formation", "autre"] as const;
export type TypeActiviteProposable = (typeof TYPES_ACTIVITE_PROPOSABLES_IA)[number];

export type PropositionAffectation = {
  employeId: string;
  employeNom: string;
  typeActivite: TypeActiviteProposable;
  chantierId: string | null;
  chantierNom: string | null;
  lieuActivite: string | null;
  date: string;
  heures: number;
  tache: string | null;
};

// Doit rester synchronise avec `types` dans src/app/(app)/conges/page.tsx et le check
// constraint de demandes_conges.type_conge.
export const TYPES_CONGE = ["conges_payes", "rtt", "sans_solde", "maladie", "evenement_familial", "recuperation", "autre"] as const;
export type TypeConge = (typeof TYPES_CONGE)[number];
const DEMI_JOURNEES = ["journee", "matin", "apres_midi"] as const;
export type DemiJournee = (typeof DEMI_JOURNEES)[number];

export type PropositionConge = {
  employeId: string;
  employeNom: string;
  typeConge: TypeConge;
  dateDebut: string;
  dateFin: string;
  demiJourDebut: DemiJournee;
  demiJourFin: DemiJournee;
  commentaire: string | null;
};

export type EvenementAssistant =
  | { type: "texte"; delta: string }
  | { type: "proposition"; proposition: PropositionAffectation }
  | { type: "proposition_conge"; proposition: PropositionConge };

const MAX_TOURS_OUTILS = 5;

async function resoudrePropositionAffectation(
  supabase: SupabaseClient,
  entrepriseId: string,
  input: Record<string, unknown>,
): Promise<PropositionAffectation | null> {
  const employeId = String(input.employe_id ?? "");
  const typeActiviteBrut = typeof input.type_activite === "string" && input.type_activite ? input.type_activite : "chantier";
  const date = String(input.date ?? "");
  const heures = Number(input.heures);
  if (!employeId || !date || !heures || heures <= 0) return null;
  if (!(TYPES_ACTIVITE_PROPOSABLES_IA as readonly string[]).includes(typeActiviteBrut)) return null;
  const typeActivite = typeActiviteBrut as TypeActiviteProposable;

  const { data: employe } = await supabase.from("employes").select("nom, prenom").eq("id", employeId).eq("entreprise_id", entrepriseId).maybeSingle();
  if (!employe) return null;

  const tache = typeof input.tache === "string" && input.tache.trim() ? input.tache.trim() : null;
  const lieuActivite = typeof input.lieu_activite === "string" && input.lieu_activite.trim() ? input.lieu_activite.trim() : null;

  if (typeActivite === "chantier") {
    const chantierId = String(input.chantier_id ?? "");
    if (!chantierId) return null;
    const { data: chantier } = await supabase.from("chantiers").select("nom").eq("id", chantierId).eq("entreprise_id", entrepriseId).maybeSingle();
    if (!chantier) return null;
    return { employeId, employeNom: `${employe.prenom} ${employe.nom}`, typeActivite, chantierId, chantierNom: chantier.nom, lieuActivite: null, date, heures, tache };
  }

  return { employeId, employeNom: `${employe.prenom} ${employe.nom}`, typeActivite, chantierId: null, chantierNom: null, lieuActivite, date, heures, tache };
}

// Les demandes de conge sont toujours personnelles : contrairement a proposer_affectation,
// on ne prend jamais un employe_id fourni par le modele, on resout systematiquement la fiche
// liee a l'utilisateur qui parle (memes regles que creerDemandeCongeAction en saisie manuelle).
async function resoudrePropositionConge(
  supabase: SupabaseClient,
  entrepriseId: string,
  utilisateurId: string,
  input: Record<string, unknown>,
): Promise<PropositionConge | null> {
  const dateDebut = String(input.date_debut ?? "");
  const dateFin = String(input.date_fin ?? "");
  if (!dateDebut || !dateFin || dateFin < dateDebut) return null;

  const typeCongeBrut = typeof input.type_conge === "string" && input.type_conge ? input.type_conge : "conges_payes";
  if (!(TYPES_CONGE as readonly string[]).includes(typeCongeBrut)) return null;
  const demiJourDebutBrut = typeof input.demi_jour_debut === "string" && input.demi_jour_debut ? input.demi_jour_debut : "journee";
  const demiJourFinBrut = typeof input.demi_jour_fin === "string" && input.demi_jour_fin ? input.demi_jour_fin : "journee";
  if (!(DEMI_JOURNEES as readonly string[]).includes(demiJourDebutBrut) || !(DEMI_JOURNEES as readonly string[]).includes(demiJourFinBrut)) return null;

  const { data: employe } = await supabase.from("employes").select("id, nom, prenom").eq("entreprise_id", entrepriseId).eq("utilisateur_id", utilisateurId).maybeSingle();
  if (!employe) return null;

  return {
    employeId: employe.id,
    employeNom: `${employe.prenom} ${employe.nom}`,
    typeConge: typeCongeBrut as TypeConge,
    dateDebut,
    dateFin,
    demiJourDebut: demiJourDebutBrut as DemiJournee,
    demiJourFin: demiJourFinBrut as DemiJournee,
    commentaire: typeof input.commentaire === "string" && input.commentaire.trim() ? input.commentaire.trim() : null,
  };
}

async function decrireUtilisateurCourant(supabase: SupabaseClient, entrepriseId: string, utilisateurId: string, prenomCompte: string | null): Promise<string> {
  const { data: employe } = await supabase
    .from("employes")
    .select("nom, prenom, poste")
    .eq("entreprise_id", entrepriseId)
    .eq("utilisateur_id", utilisateurId)
    .maybeSingle();
  if (employe) {
    return `Tu parles avec ${employe.prenom} ${employe.nom} (poste : ${employe.poste}). ` + `Cette personne EST cet employé : ne lui demande jamais son identité, tu la connais déjà. `;
  }

  // Pas de fiche employe (planning/pointage) liee, mais le compte lui-meme a un nom et un
  // poste d'acces connus : autant s'en servir plutot que de pretendre ne rien savoir.
  const [{ data: profil }, { data: appartenance }] = await Promise.all([
    supabase.from("utilisateurs").select("nom").eq("id", utilisateurId).maybeSingle(),
    supabase.from("utilisateurs_entreprises").select("poste:postes(nom)").eq("utilisateur_id", utilisateurId).eq("entreprise_id", entrepriseId).eq("statut", "actif").maybeSingle(),
  ]);
  const poste = appartenance?.poste as { nom: string } | { nom: string }[] | null;
  const nomPoste = Array.isArray(poste) ? poste[0]?.nom : poste?.nom;
  const nomComplet = [prenomCompte, profil?.nom].filter(Boolean).join(" ");

  return (
    (nomComplet ? `Tu parles avec ${nomComplet}${nomPoste ? ` (poste : ${nomPoste})` : ""}. Ne lui demande jamais son identite, tu la connais deja. ` : "") +
    `Cette personne n'a pas encore de fiche employe liee a son compte (distincte de son identite de connexion). ` +
    `Si la question porte sur son propre planning, pointage, conges ou notes de frais, indique-lui d'aller dans "Mon espace" puis de cliquer sur "Creer ma fiche employe". `
  );
}

/**
 * Boucle agentique streamée : émet les morceaux de texte au fil de l'eau, exécute les
 * outils de lecture, et s'arrête dès que l'IA appelle un outil terminal (`proposer_affectation`
 * ou `proposer_demande_conge`) — jamais d'écriture en base directe, la proposition est
 * renvoyée pour validation manuelle.
 */
export async function* demanderAssistantIAStream(
  supabase: SupabaseClient,
  entrepriseId: string,
  entrepriseNom: string,
  utilisateurId: string,
  prenomCompte: string | null,
  historique: MessageChat[],
): AsyncGenerator<EvenementAssistant, void, unknown> {
  const provider = obtenirProviderIA();
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date());
  const descriptionUtilisateur = await decrireUtilisateurCourant(supabase, entrepriseId, utilisateurId, prenomCompte);

  const system =
    `Tu es l'assistant intégré de Liria Gestion Pro, un logiciel de gestion pour entreprises du BTP, pour l'entreprise "${entrepriseNom}". ` +
    `Nous sommes le ${aujourdhui}. ${descriptionUtilisateur}` +
    `Réponds en français, de façon concise et directe, comme un collègue qui connaît bien l'activité. ` +
    `Utilise systématiquement les outils à ta disposition pour aller chercher les données réelles avant de répondre — ne devine et n'invente jamais un chiffre ou un nom. ` +
    `Si aucun outil ne permet de répondre à la question, dis-le clairement plutôt que d'inventer une réponse. ` +
    `Pour TOUTE demande qui occupe du temps d'un employé un jour donné — chantier, bureau, dépôt, visite médicale, formation, repas d'affaires, rendez-vous, réunion externe, chantier pas encore enregistré, ou n'importe quoi d'autre — utilise proposer_affectation. ` +
    `N'invente jamais de procédure manuelle et ne dis jamais que tu ne peux pas le faire : cet outil est prévu pour tous les cas, prends le cas le plus proche (type_activite="autre" par défaut si aucun des autres types ne convient) plutôt que de refuser. ` +
    `Utilise chercher_employe (et chercher_chantier_planning si un chantier existant est cité) puis verifier_disponibilite_employe avant de conclure avec proposer_affectation — tu ne crées jamais d'affectation toi-même, tu ne fais que la proposer ; l'utilisateur valide ou non. ` +
    `Dès que type_activite n'est pas "chantier", mets dans lieu_activite exactement ce que l'utilisateur a dit sur le lieu/contexte (adresse, nom de lieu, avec qui) : un lien d'itinéraire est généré automatiquement à partir de ce texte, inutile de le reformuler ou de le structurer. ` +
    `Pour toute demande d'absence/congé de l'utilisateur sur lui-même (« mets-moi absent », « je pose une demi-journée »…), utilise proposer_demande_conge — jamais proposer_affectation. Ne redirige jamais vers un menu que tu n'as pas vérifié : cette demande sera soumise pour approbation, pas automatiquement acceptée. ` +
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

    const appelAffectation = resultat.appelsOutils.find((a) => a.nom === "proposer_affectation");
    if (appelAffectation) {
      const proposition = await resoudrePropositionAffectation(supabase, entrepriseId, appelAffectation.entree);
      if (proposition) {
        yield { type: "proposition", proposition };
      } else {
        const message = "\n\nJe n'ai pas pu identifier précisément l'employé ou le chantier, peux-tu préciser ?";
        yield { type: "texte", delta: message };
      }
      return;
    }

    const appelConge = resultat.appelsOutils.find((a) => a.nom === "proposer_demande_conge");
    if (appelConge) {
      const proposition = await resoudrePropositionConge(supabase, entrepriseId, utilisateurId, appelConge.entree);
      if (proposition) {
        yield { type: "proposition_conge", proposition };
      } else {
        const message = "\n\nJe n'ai pas pu préparer cette demande : vérifie les dates, et que tu as bien une fiche employé liée à ton compte (sinon, va dans « Mon espace » → « Créer ma fiche employé »).";
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
