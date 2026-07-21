"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

// La conversation avec l'assistant passe par /api/assistant/chat (streaming SSE),
// pas par une server action — voir src/app/api/assistant/chat/route.ts.

export async function creerAffectationDepuisPropositionAction(proposition: {
  employeId: string;
  chantierId: string;
  date: string;
  heures: number;
  tache: string | null;
}): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const [{ data: employe }, { data: chantier }] = await Promise.all([
    supabase.from("employes").select("id").eq("id", proposition.employeId).eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif").maybeSingle(),
    supabase.from("chantiers").select("id").eq("id", proposition.chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
  ]);
  if (!employe || !chantier) return { error: "Employé ou chantier invalide." };
  if (!proposition.heures || proposition.heures <= 0) return { error: "Nombre d'heures invalide." };

  const { error } = await supabase.from("affectations").insert({
    entreprise_id: ctx.entrepriseId,
    chantier_id: proposition.chantierId,
    employe_id: proposition.employeId,
    date: proposition.date,
    heures: proposition.heures,
    tache: proposition.tache,
    type_activite: "chantier",
  });
  if (error) return { error: error.message };

  revalidatePath("/planning");
  return { ok: true };
}
