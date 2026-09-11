import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chargerParPages,
  COLONNES_PRESTATIONS_V2,
  type CoutPrestationBase,
  type FournisseurBase,
  type PrestationBase,
} from "@/lib/devis/catalogue-base";

/**
 * Catalogue des devis v2 d'une entreprise, lu en ENTIER (pagination, voir catalogue-base.ts) sous
 * la RLS de l'utilisateur. N'est appelé que moteur v2 actif : ces colonnes n'existent pas avant la
 * migration.
 *
 * Les prix d'achat ne sont lus que si `voirCouts` (droit `voir_couts_devis`, vérifié par
 * l'appelant ; la RLS de `prestations_catalogue_couts` le revérifie).
 */
export async function chargerCatalogueV2(
  supabase: SupabaseClient,
  entrepriseId: string,
  o: { voirCouts: boolean },
): Promise<{ prestations: PrestationBase[]; fournisseurs: FournisseurBase[]; couts: CoutPrestationBase[] } | { erreur: unknown }> {
  const [prestations, fournisseurs, couts] = await Promise.all([
    chargerParPages<PrestationBase>((de, a) =>
      supabase.from("prestations_catalogue").select(COLONNES_PRESTATIONS_V2).eq("entreprise_id", entrepriseId).order("id").range(de, a)),
    chargerParPages<FournisseurBase>((de, a) =>
      supabase.from("fournisseurs").select("id, nom, reference").eq("entreprise_id", entrepriseId).order("id").range(de, a)),
    o.voirCouts
      ? chargerParPages<CoutPrestationBase>((de, a) =>
        supabase.from("prestations_catalogue_couts").select("prestation_id, prix_achat_ht")
          .eq("entreprise_id", entrepriseId).order("prestation_id").range(de, a))
      : Promise.resolve({ data: [] as CoutPrestationBase[], erreur: null as unknown }),
  ]);
  const erreur = prestations.erreur ?? fournisseurs.erreur ?? couts.erreur;
  if (erreur) return { erreur };
  return { prestations: prestations.data, fournisseurs: fournisseurs.data, couts: couts.data };
}
