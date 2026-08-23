"use server";

import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { analyserRentabilite } from "@/lib/ai/rentabilite";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";
import { iaEstActive, MESSAGE_IA_INDISPONIBLE } from "@/lib/preview-features";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

type PointageRentabilite = { heures_normales: number; heures_supplementaires: number; employe: { cout_horaire: number | null } | { cout_horaire: number | null }[] | null };
type MouvementStockRentabilite = { quantite: number; article: { prix_achat_ht: number } | { prix_achat_ht: number }[] | null };
const un = <T,>(valeur: T | T[] | null): T | null => (Array.isArray(valeur) ? (valeur[0] ?? null) : valeur);

export async function analyserRentabiliteIAAction(chantierId: string): Promise<{ analyse: string } | { error: string }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };

  const [{ data: chantier }, { data: factures }, { data: devis }, { data: donneesPointages }, { data: depenses }, { data: donneesIndemnites }, { data: donneesMouvementsStock }, { data: donneesNotesFrais }] = await Promise.all([
    supabase.from("chantiers").select("id, nom").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("factures").select("montant_ht, statut, type").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId),
    supabase.from("devis").select("montant_ht").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).eq("statut", "accepte"),
    supabase.from("pointages").select("heures_normales, heures_supplementaires, employe:employes(cout_horaire)").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).eq("verification_statut", "valide"),
    supabase.from("depenses_fournisseurs").select("montant_ht, statut, categorie").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId),
    supabase.rpc("couts_indemnites_paie_par_chantier", { p_entreprise_id: ctx.entrepriseId, p_chantier_id: chantierId }),
    supabase.from("mouvements_stock").select("quantite, article:articles_stock(prix_achat_ht)").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).eq("type", "sortie"),
    supabase.from("notes_frais").select("montant_ttc").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).in("statut", ["valide", "exporte_comptabilite", "verrouille", "archive", "validee", "remboursee"]),
  ]);
  if (!chantier) return { error: "Chantier introuvable." };

  const budgetHt = (devis ?? []).reduce((s, item) => s + Number(item.montant_ht), 0);
  const factureHt = (factures ?? [])
    .filter((item) => !["annulee", "avoir_emis"].includes(item.statut))
    .reduce((s, item) => s + Number(item.montant_ht), 0);

  let heures = 0;
  let coutMainOeuvre = 0;
  for (const pointage of (donneesPointages ?? []) as PointageRentabilite[]) {
    const total = Number(pointage.heures_normales) + Number(pointage.heures_supplementaires);
    const cout = Number(un(pointage.employe)?.cout_horaire ?? 0);
    heures += total;
    coutMainOeuvre += total * cout;
  }

  const depensesChantier = (depenses ?? []).filter((item) => item.statut !== "annulee");
  const coutSousTraitance = depensesChantier.filter((item) => item.categorie === "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
  const coutAchats = depensesChantier.filter((item) => item.categorie !== "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
  const coutIndemnitesPaie = Number((donneesIndemnites ?? [])[0]?.total ?? 0);
  const coutStock = ((donneesMouvementsStock ?? []) as MouvementStockRentabilite[]).reduce((s, item) => s + Number(item.quantite) * Number(un(item.article)?.prix_achat_ht ?? 0), 0);
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
