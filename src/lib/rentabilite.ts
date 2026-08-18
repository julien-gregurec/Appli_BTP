import type { SupabaseClient } from "@supabase/supabase-js";

export type RentabiliteChantier = {
  chantierId: string;
  chantierNom: string;
  budgetHt: number;
  factureHt: number;
  heures: number;
  coutMainOeuvre: number;
  coutHoraireManquant: boolean;
  coutAchats: number;
  coutSousTraitance: number;
  coutIndemnitesPaie: number;
  coutStock: number;
  coutNotesFrais: number;
  marge: number;
  taux: number | null;
};

type PointageRentabilite = {
  chantier_id: string;
  employe_id: string;
  heures_normales: number;
  heures_supplementaires: number;
  cout_horaire_applique: number | null;
};
type MouvementStockRentabilite = { chantier_id: string; quantite: number; article: { prix_achat_ht: number } | { prix_achat_ht: number }[] | null };

const un = <T,>(valeur: T | T[] | null): T | null => (Array.isArray(valeur) ? (valeur[0] ?? null) : valeur);

const STATUTS_NOTES_FRAIS_COMPTEES = ["valide", "exporte_comptabilite", "verrouille", "archive", "validee", "remboursee"];

/**
 * Source de vérité unique de la rentabilité réelle d'un chantier (RENTABILITÉ-V1B).
 * Consommée par la page /rentabilite, l'analyse IA par chantier et le copilote
 * conversationnel — ne jamais recopier ce calcul ailleurs (audit initial :
 * trois implémentations divergentes, dont une omettait 3 postes de coût).
 *
 * marge = factureHt − coutMainOeuvre − coutAchats − coutSousTraitance
 *         − coutIndemnitesPaie − coutStock − coutNotesFrais
 *
 * Pointages : uniquement verification_statut='valide'. Le coût de main-d'œuvre
 * utilise le coût horaire figé au moment de la validation du pointage
 * (pointages.cout_horaire_applique), jamais le coût actuel du salarié — un
 * changement de salaire aujourd'hui ne doit jamais modifier la rentabilité
 * d'un chantier déjà pointé dans le passé.
 */
export async function calculerRentabiliteChantiers(
  supabase: SupabaseClient,
  entrepriseId: string,
  options?: { chantierId?: string },
): Promise<RentabiliteChantier[]> {
  const chantierId = options?.chantierId;

  let chantiersQuery = supabase.from("chantiers").select("id, nom").eq("entreprise_id", entrepriseId);
  chantiersQuery = chantierId ? chantiersQuery.eq("id", chantierId) : chantiersQuery.order("nom");

  let pointagesQuery = supabase
    .from("pointages")
    .select("chantier_id, employe_id, heures_normales, heures_supplementaires, cout_horaire_applique")
    .eq("entreprise_id", entrepriseId)
    .eq("verification_statut", "valide");
  if (chantierId) pointagesQuery = pointagesQuery.eq("chantier_id", chantierId);

  let mouvementsStockQuery = supabase
    .from("mouvements_stock")
    .select("chantier_id, quantite, article:articles_stock(prix_achat_ht)")
    .eq("entreprise_id", entrepriseId)
    .eq("type", "sortie")
    .not("chantier_id", "is", null);
  if (chantierId) mouvementsStockQuery = mouvementsStockQuery.eq("chantier_id", chantierId);

  let notesFraisQuery = supabase
    .from("notes_frais")
    .select("chantier_id, montant_ttc, statut")
    .eq("entreprise_id", entrepriseId)
    .not("chantier_id", "is", null)
    .in("statut", STATUTS_NOTES_FRAIS_COMPTEES);
  if (chantierId) notesFraisQuery = notesFraisQuery.eq("chantier_id", chantierId);

  const indemnitesQuery = chantierId
    ? supabase.rpc("couts_indemnites_paie_par_chantier", { p_entreprise_id: entrepriseId, p_chantier_id: chantierId })
    : supabase.rpc("couts_indemnites_paie_par_chantier", { p_entreprise_id: entrepriseId });

  const [
    { data: chantiersData },
    { data: factures },
    { data: devis },
    { data: donneesPointages },
    { data: depenses },
    { data: donneesIndemnites },
    { data: donneesMouvementsStock },
    { data: donneesNotesFrais },
    { data: donneesCoutsHoraires },
  ] = await Promise.all([
    chantiersQuery,
    supabase.from("factures").select("chantier_id, montant_ht, statut, type").eq("entreprise_id", entrepriseId),
    supabase.from("devis").select("chantier_id, montant_ht").eq("entreprise_id", entrepriseId).eq("statut", "accepte"),
    pointagesQuery,
    supabase.from("depenses_fournisseurs").select("chantier_id, montant_ht, statut, categorie").eq("entreprise_id", entrepriseId),
    indemnitesQuery,
    mouvementsStockQuery,
    notesFraisQuery,
    supabase.from("employes_cout_horaire").select("employe_id, cout_horaire").eq("entreprise_id", entrepriseId),
  ]);

  const pointages = (donneesPointages ?? []) as PointageRentabilite[];
  const indemnitesPaie = (donneesIndemnites ?? []) as { chantier_id: string; total: number }[];
  const mouvementsStock = (donneesMouvementsStock ?? []) as MouvementStockRentabilite[];
  const notesFrais = (donneesNotesFrais ?? []) as { chantier_id: string; montant_ttc: number }[];
  const coutsHorairesParEmploye = new Map((donneesCoutsHoraires ?? []).map((item) => [item.employe_id as string, Number(item.cout_horaire ?? 0)]));

  return (chantiersData ?? []).map((chantier) => {
    const budgetHt = (devis ?? []).filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.montant_ht), 0);
    const factureHt = (factures ?? [])
      .filter((item) => item.chantier_id === chantier.id && !["annulee", "avoir_emis"].includes(item.statut))
      .reduce((s, item) => s + Number(item.montant_ht), 0);

    let heures = 0;
    let coutMainOeuvre = 0;
    let coutHoraireManquant = false;
    for (const pointage of pointages.filter((item) => item.chantier_id === chantier.id)) {
      const total = Number(pointage.heures_normales) + Number(pointage.heures_supplementaires);
      // Priorité au coût figé à la validation du pointage. Repli sur le coût
      // actuel uniquement si aucun snapshot n'existe (pointage jamais passé
      // par le backfill de migration) — mieux qu'un coût compté à 0.
      const coutFige = pointage.cout_horaire_applique;
      const cout = coutFige !== null && coutFige !== undefined ? Number(coutFige) : coutsHorairesParEmploye.get(pointage.employe_id);
      if ((cout === undefined || cout === 0) && total > 0) coutHoraireManquant = true;
      heures += total;
      coutMainOeuvre += total * Number(cout ?? 0);
    }

    const depensesChantier = (depenses ?? []).filter((item) => item.chantier_id === chantier.id && item.statut !== "annulee");
    const coutSousTraitance = depensesChantier.filter((item) => item.categorie === "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
    const coutAchats = depensesChantier.filter((item) => item.categorie !== "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
    const coutIndemnitesPaie = Number(indemnitesPaie.find((item) => item.chantier_id === chantier.id)?.total ?? 0);
    const coutStock = mouvementsStock.filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.quantite) * Number(un(item.article)?.prix_achat_ht ?? 0), 0);
    const coutNotesFrais = notesFrais.filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.montant_ttc), 0);
    const marge = factureHt - coutMainOeuvre - coutAchats - coutSousTraitance - coutIndemnitesPaie - coutStock - coutNotesFrais;
    const taux = factureHt > 0 ? (marge / factureHt) * 100 : null;

    return {
      chantierId: chantier.id,
      chantierNom: chantier.nom,
      budgetHt,
      factureHt,
      heures,
      coutMainOeuvre,
      coutHoraireManquant,
      coutAchats,
      coutSousTraitance,
      coutIndemnitesPaie,
      coutStock,
      coutNotesFrais,
      marge,
      taux,
    };
  });
}
