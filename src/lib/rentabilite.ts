import type { SupabaseClient } from "@supabase/supabase-js";

export type RentabiliteChantier = {
  chantierId: string;
  chantierNom: string;
  budgetHt: number;
  factureHt: number;
  heures: number;
  coutMainOeuvre: number;
  coutAchats: number;
  coutSousTraitance: number;
  marge: number;
  taux: number | null;
};

type PointageRentabilite = {
  chantier_id: string;
  employe_id: string;
  heures_normales: number;
  heures_supplementaires: number;
};

/** Marge = facturé HT - main-d'œuvre pointée - achats/charges - sous-traitance, pour chaque chantier de l'entreprise. */
export async function calculerRentabiliteChantiers(supabase: SupabaseClient, entrepriseId: string): Promise<RentabiliteChantier[]> {
  const [{ data: chantiers }, { data: factures }, { data: devis }, { data: donneesPointages }, { data: depenses }, { data: couts }] = await Promise.all([
    supabase.from("chantiers").select("id, nom").eq("entreprise_id", entrepriseId).order("nom"),
    supabase.from("factures").select("chantier_id, montant_ht, statut, type").eq("entreprise_id", entrepriseId),
    supabase.from("devis").select("chantier_id, montant_ht").eq("entreprise_id", entrepriseId).eq("statut", "accepte"),
    supabase.from("pointages").select("chantier_id, employe_id, heures_normales, heures_supplementaires").eq("entreprise_id", entrepriseId),
    supabase.from("depenses_fournisseurs").select("chantier_id, montant_ht, statut, categorie").eq("entreprise_id", entrepriseId),
    supabase.from("employes_cout_horaire").select("employe_id, cout_horaire").eq("entreprise_id", entrepriseId),
  ]);

  const pointages = (donneesPointages ?? []) as PointageRentabilite[];
  const coutHoraireParEmploye = new Map((couts ?? []).map((cout) => [cout.employe_id, cout.cout_horaire]));

  return (chantiers ?? []).map((chantier) => {
    const budgetHt = (devis ?? []).filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.montant_ht), 0);
    const factureHt = (factures ?? [])
      .filter((item) => item.chantier_id === chantier.id && !["annulee", "avoir_emis"].includes(item.statut) && item.type !== "avoir")
      .reduce((s, item) => s + Number(item.montant_ht), 0);

    let heures = 0;
    let coutMainOeuvre = 0;
    for (const pointage of pointages.filter((item) => item.chantier_id === chantier.id)) {
      const total = Number(pointage.heures_normales) + Number(pointage.heures_supplementaires);
      const cout = Number(coutHoraireParEmploye.get(pointage.employe_id) ?? 0);
      heures += total;
      coutMainOeuvre += total * cout;
    }

    const depensesChantier = (depenses ?? []).filter((item) => item.chantier_id === chantier.id && item.statut !== "annulee");
    const coutSousTraitance = depensesChantier.filter((item) => item.categorie === "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
    const coutAchats = depensesChantier.filter((item) => item.categorie !== "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
    const marge = factureHt - coutMainOeuvre - coutAchats - coutSousTraitance;
    const taux = factureHt > 0 ? (marge / factureHt) * 100 : null;

    return {
      chantierId: chantier.id,
      chantierNom: chantier.nom,
      budgetHt,
      factureHt,
      heures,
      coutMainOeuvre,
      coutAchats,
      coutSousTraitance,
      marge,
      taux,
    };
  });
}
