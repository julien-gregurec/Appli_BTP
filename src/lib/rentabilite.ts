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
  heures_normales: number;
  heures_supplementaires: number;
  employe: { cout_horaire: number | null } | { cout_horaire: number | null }[] | null;
};

const un = <T,>(valeur: T | T[] | null): T | null => (Array.isArray(valeur) ? (valeur[0] ?? null) : valeur);

/** Marge = facturé HT - main-d'œuvre pointée - achats/charges - sous-traitance, pour chaque chantier de l'entreprise. */
export async function calculerRentabiliteChantiers(supabase: SupabaseClient, entrepriseId: string): Promise<RentabiliteChantier[]> {
  const [{ data: chantiers }, { data: factures }, { data: devis }, { data: donneesPointages }, { data: depenses }] = await Promise.all([
    supabase.from("chantiers").select("id, nom").eq("entreprise_id", entrepriseId).order("nom"),
    supabase.from("factures").select("chantier_id, montant_ht, statut, type").eq("entreprise_id", entrepriseId),
    supabase.from("devis").select("chantier_id, montant_ht").eq("entreprise_id", entrepriseId).eq("statut", "accepte"),
    supabase.from("pointages").select("chantier_id, heures_normales, heures_supplementaires, employe:employes(cout_horaire)").eq("entreprise_id", entrepriseId),
    supabase.from("depenses_fournisseurs").select("chantier_id, montant_ht, statut, categorie").eq("entreprise_id", entrepriseId),
  ]);

  const pointages = (donneesPointages ?? []) as PointageRentabilite[];

  return (chantiers ?? []).map((chantier) => {
    const budgetHt = (devis ?? []).filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.montant_ht), 0);
    const factureHt = (factures ?? [])
      .filter((item) => item.chantier_id === chantier.id && !["annulee", "avoir_emis"].includes(item.statut) && item.type !== "avoir")
      .reduce((s, item) => s + Number(item.montant_ht), 0);

    let heures = 0;
    let coutMainOeuvre = 0;
    for (const pointage of pointages.filter((item) => item.chantier_id === chantier.id)) {
      const total = Number(pointage.heures_normales) + Number(pointage.heures_supplementaires);
      const cout = Number(un(pointage.employe)?.cout_horaire ?? 0);
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
