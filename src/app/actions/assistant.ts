"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";

// La conversation avec l'assistant passe par /api/assistant/chat (streaming SSE),
// pas par une server action — voir src/app/api/assistant/chat/route.ts.

const TYPES_ACTIVITE_AUTORISES = ["chantier", "bureau", "depot", "visite_medicale", "formation", "conge", "autre"];

export async function creerAffectationDepuisPropositionAction(proposition: {
  employeId: string;
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

  const estChantier = proposition.typeActivite === "chantier";
  if (estChantier !== Boolean(proposition.chantierId)) return { error: "Chantier invalide." };

  const [{ data: employe }, { data: chantier }] = await Promise.all([
    supabase.from("employes").select("id").eq("id", proposition.employeId).eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif").maybeSingle(),
    estChantier ? supabase.from("chantiers").select("id").eq("id", proposition.chantierId as string).eq("entreprise_id", ctx.entrepriseId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!employe || (estChantier && !chantier)) return { error: "Employé ou chantier invalide." };

  const { error } = await supabase.from("affectations").insert({
    entreprise_id: ctx.entrepriseId,
    chantier_id: proposition.chantierId,
    employe_id: proposition.employeId,
    date: proposition.date,
    heures: proposition.heures,
    tache: proposition.tache,
    type_activite: proposition.typeActivite,
    lieu_activite: estChantier ? null : proposition.lieuActivite,
  });
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
