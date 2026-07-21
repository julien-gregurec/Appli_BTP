"use server";

import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { analyserRentabilite } from "@/lib/ai/rentabilite";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";

type PointageRentabilite = { heures_normales: number; heures_supplementaires: number; employe: { cout_horaire: number | null } | { cout_horaire: number | null }[] | null };
const un = <T,>(valeur: T | T[] | null): T | null => (Array.isArray(valeur) ? (valeur[0] ?? null) : valeur);

export async function analyserRentabiliteIAAction(chantierId: string): Promise<{ analyse: string } | { error: string }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const [{ data: chantier }, { data: factures }, { data: devis }, { data: donneesPointages }, { data: depenses }] = await Promise.all([
    supabase.from("chantiers").select("id, nom").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("factures").select("montant_ht, statut, type").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId),
    supabase.from("devis").select("montant_ht").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).eq("statut", "accepte"),
    supabase.from("pointages").select("heures_normales, heures_supplementaires, employe:employes(cout_horaire)").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId),
    supabase.from("depenses_fournisseurs").select("montant_ht, statut, categorie").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId),
  ]);
  if (!chantier) return { error: "Chantier introuvable." };

  const budgetHt = (devis ?? []).reduce((s, item) => s + Number(item.montant_ht), 0);
  const factureHt = (factures ?? [])
    .filter((item) => !["annulee", "avoir_emis"].includes(item.statut) && item.type !== "avoir")
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
  const marge = factureHt - coutMainOeuvre - coutAchats - coutSousTraitance;
  const taux = factureHt > 0 ? (marge / factureHt) * 100 : null;

  const depassement = await verifierPlafondIA(supabase, ctx.entrepriseId);
  if (depassement) return { error: depassement };

  try {
    const analyse = await analyserRentabilite({
      chantierNom: chantier.nom,
      budgetHt,
      factureHt,
      heures,
      coutMainOeuvre,
      coutAchats,
      coutSousTraitance,
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
