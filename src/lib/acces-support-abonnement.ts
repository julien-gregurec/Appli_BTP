import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Source unique : qui peut gérer l'abonnement (portail Stripe) d'une
// entreprise suspendue. Utilisé à la fois par ouvrirPortailAbonnementSuspenduAction
// (contrôle réel avant d'ouvrir le portail) et par la page /abonnement-suspendu
// (n'affiche le bouton qu'à ceux qui pourront réellement s'en servir) —
// GP-EXTERNAL-PILOT-CLOSURE-V1 : dupliquer cette logique aux deux endroits
// aurait pu les faire diverger silencieusement (bouton visible mais refusé,
// ou l'inverse) si la règle change un jour.
export async function peutGererAbonnementSuspendu(
  supabase: SupabaseClient,
  utilisateurId: string,
  entrepriseId: string,
): Promise<boolean> {
  const [{ data: support }, { data: appartenance }] = await Promise.all([
    supabase.rpc("est_acces_support_actif", { p_entreprise_id: entrepriseId }),
    supabase.from("utilisateurs_entreprises").select("poste_id").eq("utilisateur_id", utilisateurId).eq("entreprise_id", entrepriseId).eq("statut", "actif").maybeSingle(),
  ]);
  if (support === true) return true;
  if (!appartenance?.poste_id) return false;
  const { data: permission } = await supabase
    .from("permissions_poste")
    .select("autorise")
    .eq("entreprise_id", entrepriseId)
    .eq("poste_id", appartenance.poste_id)
    .eq("cle_permission", "gerer_parametres")
    .eq("autorise", true)
    .maybeSingle();
  return Boolean(permission);
}
