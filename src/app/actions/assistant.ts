"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";

// La conversation avec l'assistant passe par /api/assistant/chat (streaming SSE),
// pas par une server action — voir src/app/api/assistant/chat/route.ts.

const TYPES_ACTIVITE_AUTORISES = ["chantier", "bureau", "depot", "visite_medicale", "formation", "autre"];

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
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
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
