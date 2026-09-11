"use server";

import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { analyserRentabilite } from "@/lib/ai/rentabilite";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";
import { iaEstActive, MESSAGE_IA_INDISPONIBLE } from "@/lib/preview-features";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { lireCoutsStockChantiers, MESSAGE_ANALYSE_RENTABILITE_REFUSEE, peutConsulterRentabilite } from "@/lib/rentabilite-stock";

type PointageRentabilite = { employe_id: string; heures_normales: number; heures_supplementaires: number };

export async function analyserRentabiliteIAAction(chantierId: string): Promise<{ analyse: string } | { error: string }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!aAccesIA(permissions)) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  // D1 : l'analyse repose sur le coût du stock et la marge. Elle exige acces_rentabilite,
  // contrôlé AVANT toute lecture : une option IA seule ne donne accès à aucun chiffre.
  if (!peutConsulterRentabilite(permissions)) return { error: MESSAGE_ANALYSE_RENTABILITE_REFUSEE };
  const supabase = await createClient();

  const [{ data: chantier }, { data: factures }, { data: devis }, { data: donneesPointages }, { data: depenses }, { data: donneesIndemnites }, coutsStock, { data: donneesNotesFrais }, { data: couts }] = await Promise.all([
    supabase.from("chantiers").select("id, nom").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("factures").select("montant_ht, statut, type").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId),
    supabase.from("devis").select("montant_ht").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).eq("statut", "accepte"),
    supabase.from("pointages").select("employe_id, heures_normales, heures_supplementaires").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).eq("verification_statut", "valide"),
    supabase.from("depenses_fournisseurs").select("montant_ht, statut, categorie").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId),
    supabase.rpc("couts_indemnites_paie_par_chantier", { p_entreprise_id: ctx.entrepriseId, p_chantier_id: chantierId }),
    lireCoutsStockChantiers(supabase, ctx.entrepriseId, chantierId),
    supabase.from("notes_frais").select("montant_ttc").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).in("statut", ["valide", "exporte_comptabilite", "verrouille", "archive", "validee", "remboursee"]),
    supabase.from("employes_cout_horaire").select("employe_id, cout_horaire").eq("entreprise_id", ctx.entrepriseId),
  ]);
  if (!chantier) return { error: "Chantier introuvable." };
  // Coût du stock refusé ou illisible : l'analyse s'arrête, sans appeler l'IA, plutôt que
  // de raisonner sur un coût à 0 € et une marge surévaluée.
  if (coutsStock.etat !== "disponible") return { error: coutsStock.message };
  // Habilité et lu : un chantier absent du résultat n'a eu aucune sortie (vrai 0 €).
  const coutStock = coutsStock.parChantier.get(chantierId) ?? 0;

  const coutHoraireParEmploye = new Map((couts ?? []).map((cout) => [cout.employe_id, cout.cout_horaire]));
  const budgetHt = (devis ?? []).reduce((s, item) => s + Number(item.montant_ht), 0);
  const factureHt = (factures ?? [])
    .filter((item) => !["annulee", "avoir_emis"].includes(item.statut))
    .reduce((s, item) => s + Number(item.montant_ht), 0);

  let heures = 0;
  let coutMainOeuvre = 0;
  for (const pointage of (donneesPointages ?? []) as PointageRentabilite[]) {
    const total = Number(pointage.heures_normales) + Number(pointage.heures_supplementaires);
    const cout = Number(coutHoraireParEmploye.get(pointage.employe_id) ?? 0);
    heures += total;
    coutMainOeuvre += total * cout;
  }

  const depensesChantier = (depenses ?? []).filter((item) => item.statut !== "annulee");
  const coutSousTraitance = depensesChantier.filter((item) => item.categorie === "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
  const coutAchats = depensesChantier.filter((item) => item.categorie !== "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
  const coutIndemnitesPaie = Number((donneesIndemnites ?? [])[0]?.total ?? 0);
  const coutNotesFrais = (donneesNotesFrais ?? []).reduce((s, item) => s + Number(item.montant_ttc), 0);
  const marge = factureHt - coutMainOeuvre - coutAchats - coutSousTraitance - coutIndemnitesPaie - coutStock - coutNotesFrais;
  const taux = factureHt > 0 ? (marge / factureHt) * 100 : null;

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
