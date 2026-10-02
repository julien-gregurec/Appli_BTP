"use server";

import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { analyserRentabilite } from "@/lib/ai/rentabilite";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";
import { iaEstActive, MESSAGE_IA_INDISPONIBLE } from "@/lib/preview-features";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { lireRentabiliteChantier } from "@/lib/rentabilite";

export async function analyserRentabiliteIAAction(chantierId: string): Promise<{ analyse: string } | { error: string }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };

  // Totaux calculés en base (rentabilite_chantier, 20261002001107) : un chantier
  // peut porter plus de 1 000 pointages, que PostgREST tronquerait sans erreur.
  const { data: chantier } = await supabase.from("chantiers").select("id, nom").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!chantier) return { error: "Chantier introuvable." };
  let rentabilite: Awaited<ReturnType<typeof lireRentabiliteChantier>>;
  try {
    rentabilite = await lireRentabiliteChantier(supabase, ctx.entrepriseId, chantierId);
  } catch (err) {
    return { error: messageErreurUtilisateur("analyserRentabiliteIAAction", err, "La rentabilité de ce chantier n’est pas disponible pour le moment.") };
  }
  if (!rentabilite) return { error: "Chantier introuvable." };
  const { budgetHt, factureHt, heures, coutMainOeuvre, coutAchats, coutStock, coutNotesFrais, coutSousTraitance, coutIndemnitesPaie, marge, taux } = rentabilite;

  const depassement = await verifierPlafondIA(supabase, ctx.entrepriseId);
  if (depassement) return { error: depassement };

  try {
    const { texte: analyse, usage } = await analyserRentabilite({
      chantierNom: chantier.nom,
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
    journaliserAppelIA(supabase, {
      entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "rentabilite", statut: "succes",
      jetonsEntree: usage?.jetonsEntree, jetonsSortie: usage?.jetonsSortie, jetonsTotal: usage?.jetonsTotal, coutEstimeHT: usage?.coutEstimeHT,
    });
    return { analyse };
  } catch (err) {
    const messageBrut = err instanceof Error ? err.message : "Erreur lors de l'analyse IA.";
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "rentabilite", statut: "erreur", messageErreur: messageBrut });
    return { error: messageErreurUtilisateur("analyserRentabiliteIAAction", err, "L’analyse assistée de rentabilité n’est pas disponible pour le moment.") };
  }
}
