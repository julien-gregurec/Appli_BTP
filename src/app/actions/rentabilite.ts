"use server";

import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { calculerRentabiliteChantiers } from "@/lib/rentabilite";
import { analyserRentabilite } from "@/lib/ai/rentabilite";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";
import { iaEstActive, MESSAGE_IA_INDISPONIBLE } from "@/lib/preview-features";

export async function analyserRentabiliteIAAction(chantierId: string): Promise<{ analyse: string } | { error: string }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };

  const [ligne] = await calculerRentabiliteChantiers(supabase, ctx.entrepriseId, { chantierId });
  if (!ligne) return { error: "Chantier introuvable." };
  const { chantierNom, budgetHt, factureHt, heures, coutMainOeuvre, coutAchats, coutStock, coutNotesFrais, coutSousTraitance, coutIndemnitesPaie, marge, taux } = ligne;

  const depassement = await verifierPlafondIA(supabase, ctx.entrepriseId);
  if (depassement) return { error: depassement };

  try {
    const analyse = await analyserRentabilite({
      chantierNom,
      budgetHt,
      factureHt,
      heures,
      coutMainOeuvre,
      coutAchats,
      coutStock,
      coutNotesFrais,
      coutSousTraitance,
      coutIndemnitesPaie,
      marge,
      taux,
    });
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "rentabilite", statut: "succes" });
    return { analyse };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de l'analyse IA.";
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "rentabilite", statut: "erreur", messageErreur: message });
    return { error: message };
  }
}
