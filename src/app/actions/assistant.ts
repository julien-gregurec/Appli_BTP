"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";

// La conversation avec l'assistant passe par /api/assistant/chat (streaming SSE),
// pas par une server action — voir src/app/api/assistant/chat/route.ts.

const TYPES_ACTIVITE_AUTORISES = ["chantier", "bureau", "depot", "visite_medicale", "formation", "conge", "autre"];

export async function creerAffectationDepuisPropositionAction(proposition: {
  affectationId: string | null;
  employeIds: string[];
  typeActivite: string;
  chantierId: string | null;
  lieuActivite: string | null;
  date: string;
  heures: number;
  tache: string | null;
}): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!aAccesIA(permissions)) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  // Defense en profondeur : la RLS sur `affectations` impose deja gerer_planning, mais un
  // message clair ici vaut mieux que l'erreur Postgres brute remontee telle quelle.
  if (!(permissions === null || permissions.includes("gerer_planning"))) return { error: "Ton poste n'a pas le droit de modifier le planning." };
  if (!TYPES_ACTIVITE_AUTORISES.includes(proposition.typeActivite)) return { error: "Type d'activité invalide." };
  if (!proposition.heures || proposition.heures <= 0) return { error: "Nombre d'heures invalide." };
  if (!proposition.employeIds.length) return { error: "Aucun employé sélectionné." };

  const estChantier = proposition.typeActivite === "chantier";
  if (estChantier !== Boolean(proposition.chantierId)) return { error: "Chantier invalide." };

  const [{ data: employes }, { data: chantier }] = await Promise.all([
    supabase.from("employes").select("id").in("id", proposition.employeIds).eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif"),
    estChantier ? supabase.from("chantiers").select("id").eq("id", proposition.chantierId as string).eq("entreprise_id", ctx.entrepriseId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!employes || employes.length !== proposition.employeIds.length || (estChantier && !chantier)) return { error: "Employé ou chantier invalide." };

  const valeurs = {
    chantier_id: proposition.chantierId,
    date: proposition.date,
    heures: proposition.heures,
    tache: proposition.tache,
    type_activite: proposition.typeActivite,
    lieu_activite: estChantier ? null : proposition.lieuActivite,
  };

  if (proposition.affectationId) {
    const { error } = await supabase.from("affectations").update(valeurs).eq("id", proposition.affectationId).eq("entreprise_id", ctx.entrepriseId);
    if (error) return { error: error.message };
    revalidatePath("/planning");
    return { ok: true };
  }

  const { error } = await supabase.from("affectations").insert(proposition.employeIds.map((employeId) => ({ entreprise_id: ctx.entrepriseId, employe_id: employeId, ...valeurs })));
  if (error) return { error: error.message };

  revalidatePath("/planning");
  return { ok: true };
}

const TYPES_CONGE_AUTORISES = ["conges_payes", "rtt", "sans_solde", "maladie", "evenement_familial", "recuperation", "autre"];
const DEMI_JOURNEES_AUTORISEES = ["journee", "matin", "apres_midi"];

// Meme comportement que creerDemandeCongeAction (saisie manuelle depuis /conges) : brouillon
// puis soumission immediate via la RPC dediee, jamais d'approbation automatique. employeId
// n'est jamais fourni par le client ici : on ne cree que pour SA PROPRE fiche.
export async function creerDemandeCongeDepuisPropositionAction(proposition: {
  typeConge: string;
  dateDebut: string;
  dateFin: string;
  demiJourDebut: string;
  demiJourFin: string;
  commentaire: string | null;
}): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  if (!TYPES_CONGE_AUTORISES.includes(proposition.typeConge)) return { error: "Type de congé invalide." };
  if (!DEMI_JOURNEES_AUTORISEES.includes(proposition.demiJourDebut) || !DEMI_JOURNEES_AUTORISEES.includes(proposition.demiJourFin)) return { error: "Demi-journée invalide." };
  if (!proposition.dateDebut || !proposition.dateFin || proposition.dateFin < proposition.dateDebut) return { error: "Période invalide." };

  const { data: employe } = await supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  if (!employe) return { error: "Ton compte n'est pas lié à une fiche employé." };

  const { data, error } = await supabase
    .from("demandes_conges")
    .insert({
      entreprise_id: ctx.entrepriseId,
      employe_id: employe.id,
      type_conge: proposition.typeConge,
      date_debut: proposition.dateDebut,
      date_fin: proposition.dateFin,
      demi_jour_debut: proposition.demiJourDebut,
      demi_jour_fin: proposition.demiJourFin,
      commentaire: proposition.commentaire,
      created_by: ctx.userId,
      statut: "brouillon",
    })
    .select("id")
    .single();
  if (error || !data?.id) return { error: error?.message ?? "Création impossible." };

  const { error: erreurSoumission } = await supabase.rpc("transition_demande_conge", { p_demande_id: data.id, p_action: "soumettre", p_message: null });
  if (erreurSoumission) return { error: erreurSoumission.message };

  revalidatePath("/conges");
  return { ok: true };
}

// Meme logique de recherche/creation de conversation que creerConversationInterneAction
// (saisie manuelle depuis /messagerie) : conversation directe unique par paire d'employes,
// un seul fil partage par chantier. L'auteur n'est jamais fourni par le client : on ne
// resout que la fiche employe liee au compte qui parle (RLS l'exige de toute facon).
export async function envoyerMessageInterneDepuisPropositionAction(proposition: {
  destinataireEmployeId: string | null;
  chantierId: string | null;
  contenu: string;
}): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  if (!proposition.contenu.trim()) return { error: "Message vide." };
  if (Boolean(proposition.destinataireEmployeId) === Boolean(proposition.chantierId)) return { error: "Destinataire invalide." };

  const { data: employe } = await supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  if (!employe) return { error: "Ton compte n'est pas lié à une fiche employé." };

  let conversationId: string | null = null;
  if (proposition.chantierId) {
    const { data: existante } = await supabase.from("conversations_internes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("type", "chantier").eq("chantier_id", proposition.chantierId).maybeSingle();
    conversationId = existante?.id ?? null;
    if (!conversationId) {
      const { data, error } = await supabase.from("conversations_internes").insert({ entreprise_id: ctx.entrepriseId, type: "chantier", chantier_id: proposition.chantierId, cree_par_employe_id: employe.id }).select("id").single();
      if (error || !data) return { error: error?.message ?? "Conversation impossible à créer." };
      conversationId = data.id;
    }
  } else {
    const { data: conversations } = await supabase.from("conversations_internes").select("id,cree_par_employe_id,destinataire_employe_id").eq("entreprise_id", ctx.entrepriseId).eq("type", "directe");
    const existante = (conversations ?? []).find(
      (c) => (c.cree_par_employe_id === employe.id && c.destinataire_employe_id === proposition.destinataireEmployeId) || (c.cree_par_employe_id === proposition.destinataireEmployeId && c.destinataire_employe_id === employe.id),
    );
    conversationId = existante?.id ?? null;
    if (!conversationId) {
      const { data, error } = await supabase.from("conversations_internes").insert({ entreprise_id: ctx.entrepriseId, type: "directe", destinataire_employe_id: proposition.destinataireEmployeId, cree_par_employe_id: employe.id }).select("id").single();
      if (error || !data) return { error: error?.message ?? "Conversation impossible à créer." };
      conversationId = data.id;
    }
  }

  const { error } = await supabase.from("messages_internes").insert({ entreprise_id: ctx.entrepriseId, conversation_id: conversationId, auteur_employe_id: employe.id, contenu: proposition.contenu });
  if (error) return { error: error.message };

  revalidatePath("/messagerie");
  return { ok: true };
}

// Meme insertion que envoyerMessageSupportAction (saisie manuelle depuis /aide) — pas de
// lien avec une fiche employe, un compte suffit.
export async function envoyerMessageSupportDepuisPropositionAction(proposition: { contenu: string }): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  if (!proposition.contenu.trim()) return { error: "Message vide." };

  const { error } = await supabase.from("support_messages").insert({
    entreprise_id: ctx.entrepriseId,
    cote: "entreprise",
    auteur_id: ctx.userId,
    auteur_nom: [ctx.prenom, ctx.entrepriseNom].filter(Boolean).join(" · ") || "Entreprise",
    contenu: proposition.contenu,
  });
  if (error) return { error: error.message };

  revalidatePath("/aide");
  return { ok: true };
}
