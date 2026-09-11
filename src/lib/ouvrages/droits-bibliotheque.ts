import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise, type ContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";

/**
 * Droits des pages de la bibliothèque d'ouvrages (moteur de devis v2).
 *
 * À n'appeler QUE lorsque `devisV2Actif()` est vrai : `lireSeuilTauxMarque` lit une colonne qui
 * n'existe qu'avec la migration du moteur v2.
 */
export type DroitsBibliotheque = {
  ctx: ContexteEntreprise;
  peutGerer: boolean;
  peutVoirCouts: boolean;
  peutGererCouts: boolean;
};

const possede = (permissions: string[] | null, cle: string) => permissions === null || permissions.includes(cle);

export async function chargerDroitsBibliotheque(): Promise<DroitsBibliotheque> {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const peutVoirCouts = possede(permissions, "voir_couts_devis");
  return {
    ctx,
    peutGerer: possede(permissions, "gerer_ouvrages"),
    peutVoirCouts,
    // Gérer sans voir n'aurait pas de sens à l'écran : le champ ne s'affiche qu'avec la lecture.
    peutGererCouts: peutVoirCouts && possede(permissions, "gerer_couts_devis"),
  };
}

/** Seuil d'alerte de taux de marque de l'entreprise ; `null` s'il n'est pas configuré (ou illisible). */
export async function lireSeuilTauxMarque(entrepriseId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("entreprises").select("seuil_taux_marque_pct").eq("id", entrepriseId).maybeSingle();
  const brut = (data as { seuil_taux_marque_pct?: number | string | null } | null)?.seuil_taux_marque_pct;
  if (brut === null || brut === undefined || brut === "") return null;
  const n = Number(brut);
  return Number.isFinite(n) ? n : null;
}
