import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Coût du stock consommé par chantier (ELSATIA-STOCK-PRIX-CONFIDENTIALITE-COLONNES-V1).
 *
 * Le prix d'achat unitaire n'est plus lisible par `authenticated` : le coût stock ne se
 * lit que par la RPC `couts_stock_par_chantier`, qui renvoie un TOTAL par chantier et
 * refuse (42501) tout appelant sans `acces_rentabilite`.
 *
 * Décision D1 : aucun repli à 0 €. Un refus ou un échec produit un état explicite
 * (« refuse » / « indisponible ») que l'écran affiche comme tel ; seul l'état
 * « disponible » donne des montants, et un chantier absent y vaut réellement 0 € (aucune
 * sortie de stock vers ce chantier).
 */

export const PERMISSION_RENTABILITE = "acces_rentabilite";

export const MESSAGE_COUT_STOCK_REFUSE =
  "Coût du stock non communiqué : la rentabilité exige la permission « Consulter rentabilité et trésorerie ».";
export const MESSAGE_COUT_STOCK_INDISPONIBLE =
  "Coût du stock indisponible : la lecture a échoué. La marge n’est pas calculée pour ne pas afficher un chiffre faux.";
export const MESSAGE_RENTABILITE_REFUSEE =
  "Accès refusé : la rentabilité exige la permission « Consulter rentabilité et trésorerie ». Aucun coût ni aucune marge n’est communiqué.";
export const MESSAGE_ANALYSE_RENTABILITE_REFUSEE =
  "L’analyse de rentabilité exige la permission « Consulter rentabilité et trésorerie » : aucun coût ni aucune marge n’est communiqué.";

export type CoutsStockChantiers =
  | { etat: "disponible"; parChantier: ReadonlyMap<string, number> }
  | { etat: "refuse" | "indisponible"; message: string };

type ReponseRpc = { data: unknown; error: { code?: string | null; message?: string | null } | null };

/** `null` = accès complet (gérant, prototype) ; sinon la permission doit figurer au poste. */
export function peutConsulterRentabilite(permissions: string[] | null): boolean {
  return permissions === null || permissions.includes(PERMISSION_RENTABILITE);
}

export function interpreterCoutsStock(reponse: ReponseRpc): CoutsStockChantiers {
  if (reponse.error) {
    return reponse.error.code === "42501"
      ? { etat: "refuse", message: MESSAGE_COUT_STOCK_REFUSE }
      : { etat: "indisponible", message: MESSAGE_COUT_STOCK_INDISPONIBLE };
  }
  if (!Array.isArray(reponse.data)) return { etat: "indisponible", message: MESSAGE_COUT_STOCK_INDISPONIBLE };

  const parChantier = new Map<string, number>();
  for (const ligne of reponse.data as unknown[]) {
    const { chantier_id: chantierId, total } = (ligne ?? {}) as { chantier_id?: unknown; total?: unknown };
    const montant = Number(total);
    // Une ligne illisible rend TOUT le résultat indisponible : un total partiel serait
    // un résultat financier incomplet silencieux.
    if (typeof chantierId !== "string" || !chantierId || total === null || total === undefined || !Number.isFinite(montant)) {
      return { etat: "indisponible", message: MESSAGE_COUT_STOCK_INDISPONIBLE };
    }
    parChantier.set(chantierId, (parChantier.get(chantierId) ?? 0) + montant);
  }
  return { etat: "disponible", parChantier };
}

/** Montant du chantier si le coût est disponible ; `null` sinon — jamais 0 par défaut. */
export function coutStockDuChantier(couts: CoutsStockChantiers, chantierId: string): number | null {
  if (couts.etat !== "disponible") return null;
  return couts.parChantier.get(chantierId) ?? 0;
}

/** Total des chantiers listés si le coût est disponible ; `null` sinon. */
export function totalCoutStock(couts: CoutsStockChantiers, chantierIds: readonly string[]): number | null {
  if (couts.etat !== "disponible") return null;
  return chantierIds.reduce((total, id) => total + (couts.parChantier.get(id) ?? 0), 0);
}

/**
 * Marge et taux d'un chantier. Dès que le coût stock est inconnu, la marge l'est aussi :
 * la retrancher d'un coût partiel afficherait une marge surévaluée.
 */
export function margeChantier(
  factureHt: number,
  autresCouts: number,
  coutStock: number | null,
): { marge: number | null; taux: number | null } {
  if (coutStock === null) return { marge: null, taux: null };
  const marge = factureHt - autresCouts - coutStock;
  return { marge, taux: factureHt > 0 ? (marge / factureHt) * 100 : null };
}

export async function lireCoutsStockChantiers(
  supabase: Pick<SupabaseClient, "rpc">,
  entrepriseId: string,
  chantierId?: string,
): Promise<CoutsStockChantiers> {
  try {
    const reponse = await supabase.rpc(
      "couts_stock_par_chantier",
      chantierId ? { p_entreprise_id: entrepriseId, p_chantier_id: chantierId } : { p_entreprise_id: entrepriseId },
    );
    return interpreterCoutsStock(reponse as ReponseRpc);
  } catch {
    return { etat: "indisponible", message: MESSAGE_COUT_STOCK_INDISPONIBLE };
  }
}
