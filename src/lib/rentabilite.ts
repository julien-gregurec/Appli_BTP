import type { SupabaseClient } from "@supabase/supabase-js";

export type EcartIndicateur = {
  prevu: number | null;
  realise: number;
  ecart: number | null;
  ecartPourcent: number | null;
};

export type PrevuRealiseChantier = RentabiliteChantier & {
  caPrevuHt: number;
  heuresPrevues: number | null;
  coutMainOeuvrePrevu: number | null;
  coutAchatsPrevu: number | null;
  coutSousTraitancePrevu: number | null;
  margePrevue: number | null;
  tauxMargePrevu: number | null;
  ecarts: {
    ca: EcartIndicateur;
    heures: EcartIndicateur;
    coutMainOeuvre: EcartIndicateur;
    coutAchats: EcartIndicateur;
    marge: EcartIndicateur;
    tauxMarge: EcartIndicateur;
  };
};

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

function calculerEcart(prevu: number | null, realise: number): EcartIndicateur {
  if (prevu === null) return { prevu: null, realise, ecart: null, ecartPourcent: null };
  const ecart = realise - prevu;
  const ecartPourcent = prevu !== 0 ? (ecart / Math.abs(prevu)) * 100 : null;
  return { prevu, realise, ecart, ecartPourcent };
}

/**
 * Prévisionnel + écarts prévu/réalisé (RENTABILITÉ-V1C), construit au-dessus de
 * calculerRentabiliteChantiers (réalisé, inchangé). N'invente aucune donnée :
 * seuls le CA prévu (devis acceptés), les heures prévues (lignes de devis
 * main-d'œuvre en heures — un devis en forfait ne contribue à aucune heure
 * prévue, limite assumée) et la sous-traitance prévue (sous_traitants_chantiers,
 * seule table de coût prévisionnel réellement dédiée) ont une source fiable.
 * Le coût de main-d'œuvre prévu et les achats prévus restent `null` : les
 * lignes de devis portent un prix de vente au client, jamais un coût interne,
 * et aucun poste ni salarié n'y est rattaché — les fabriquer serait mélanger
 * chiffre d'affaires et coût. La marge prévue n'est donc calculée que si ces
 * deux postes deviennent un jour disponibles (jamais aujourd'hui) : afficher
 * une marge prévue partielle, silencieusement amputée de la MO et des achats,
 * serait trompeur plutôt qu'utile.
 */
export async function calculerPrevuRealiseChantiers(
  supabase: SupabaseClient,
  entrepriseId: string,
  options?: { chantierId?: string },
): Promise<PrevuRealiseChantier[]> {
  const chantierId = options?.chantierId;
  const realises = await calculerRentabiliteChantiers(supabase, entrepriseId, options);

  let lignesQuery = supabase
    .from("lignes_devis")
    .select("quantite, type, unite, devis:devis!inner(chantier_id, statut, entreprise_id)")
    .eq("devis.entreprise_id", entrepriseId)
    .eq("devis.statut", "accepte");
  if (chantierId) lignesQuery = lignesQuery.eq("devis.chantier_id", chantierId);

  let sousTraitanceQuery = supabase
    .from("sous_traitants_chantiers")
    .select("chantier_id, montant_previsionnel_ht, statut")
    .eq("entreprise_id", entrepriseId)
    .neq("statut", "annulee");
  if (chantierId) sousTraitanceQuery = sousTraitanceQuery.eq("chantier_id", chantierId);

  const [{ data: donneesLignes }, { data: donneesSousTraitance }] = await Promise.all([lignesQuery, sousTraitanceQuery]);

  type LigneDevisPrevue = { quantite: number; type: string; unite: string; devis: { chantier_id: string | null } | { chantier_id: string | null }[] | null };
  const lignes = (donneesLignes ?? []) as LigneDevisPrevue[];
  const sousTraitanceParChantier = new Map<string, number>();
  for (const item of (donneesSousTraitance ?? []) as { chantier_id: string; montant_previsionnel_ht: number }[]) {
    sousTraitanceParChantier.set(item.chantier_id, (sousTraitanceParChantier.get(item.chantier_id) ?? 0) + Number(item.montant_previsionnel_ht));
  }
  const heuresPrevuesParChantier = new Map<string, number>();
  for (const ligne of lignes) {
    if (ligne.type !== "main_oeuvre" || ligne.unite !== "h") continue;
    const devisLie = un(ligne.devis);
    const cid = devisLie?.chantier_id;
    if (!cid) continue;
    heuresPrevuesParChantier.set(cid, (heuresPrevuesParChantier.get(cid) ?? 0) + Number(ligne.quantite));
  }

  return realises.map((realise) => {
    const caPrevuHt = realise.budgetHt;
    const heuresPrevues = heuresPrevuesParChantier.get(realise.chantierId) ?? null;
    const coutMainOeuvrePrevu: number | null = null;
    const coutAchatsPrevu: number | null = null;
    const coutSousTraitancePrevu = sousTraitanceParChantier.get(realise.chantierId) ?? null;
    const coutsPrevusConnus = coutMainOeuvrePrevu !== null && coutAchatsPrevu !== null;
    const margePrevue = coutsPrevusConnus ? caPrevuHt - coutMainOeuvrePrevu - coutAchatsPrevu - (coutSousTraitancePrevu ?? 0) : null;
    const tauxMargePrevu = margePrevue !== null && caPrevuHt > 0 ? (margePrevue / caPrevuHt) * 100 : null;

    return {
      ...realise,
      caPrevuHt,
      heuresPrevues,
      coutMainOeuvrePrevu,
      coutAchatsPrevu,
      coutSousTraitancePrevu,
      margePrevue,
      tauxMargePrevu,
      ecarts: {
        ca: calculerEcart(caPrevuHt, realise.factureHt),
        heures: calculerEcart(heuresPrevues, realise.heures),
        coutMainOeuvre: calculerEcart(coutMainOeuvrePrevu, realise.coutMainOeuvre),
        coutAchats: calculerEcart(coutAchatsPrevu, realise.coutAchats),
        marge: calculerEcart(margePrevue, realise.marge),
        tauxMarge: realise.taux !== null ? calculerEcart(tauxMargePrevu, realise.taux) : { prevu: tauxMargePrevu, realise: 0, ecart: null, ecartPourcent: null },
      },
    };
  });
}
