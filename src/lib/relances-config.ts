import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PARAMETRES_RELANCES_DEFAUT, type ParametresRelances } from "@/lib/relances";

type LigneParametresRelances = {
  entreprise_id: string;
  devis_auto_actif: boolean;
  devis_delai_premiere_relance_jours: number;
  devis_delai_entre_relances_jours: number;
  devis_nombre_max_relances: number;
  factures_auto_actif: boolean;
  factures_delai_premiere_relance_jours: number;
  factures_delai_entre_relances_jours: number;
  factures_nombre_max_relances: number;
  envoyer_weekend: boolean;
  pause_jusqu_au: string | null;
};

function versParametres(entrepriseId: string, ligne: LigneParametresRelances | null): ParametresRelances {
  if (!ligne) return { entrepriseId, ...PARAMETRES_RELANCES_DEFAUT };
  return {
    entrepriseId,
    devisAutoActif: ligne.devis_auto_actif,
    devisDelaiPremiereRelanceJours: ligne.devis_delai_premiere_relance_jours,
    devisDelaiEntreRelancesJours: ligne.devis_delai_entre_relances_jours,
    devisNombreMaxRelances: ligne.devis_nombre_max_relances,
    facturesAutoActif: ligne.factures_auto_actif,
    facturesDelaiPremiereRelanceJours: ligne.factures_delai_premiere_relance_jours,
    facturesDelaiEntreRelancesJours: ligne.factures_delai_entre_relances_jours,
    facturesNombreMaxRelances: ligne.factures_nombre_max_relances,
    envoyerWeekend: ligne.envoyer_weekend,
    pauseJusquAu: ligne.pause_jusqu_au,
  };
}

// §10 : si aucune ligne n'existe encore pour cette entreprise (première utilisation), renvoie
// les valeurs par défaut documentées (PARAMETRES_RELANCES_DEFAUT) — auto désactivée tant
// qu'un admin ne l'active pas explicitement (§11). Aucune ligne n'est créée tant que
// personne n'a rien enregistré.
export async function chargerParametresRelances(supabase: SupabaseClient, entrepriseId: string): Promise<ParametresRelances> {
  const { data } = await supabase.from("parametres_relances").select("*").eq("entreprise_id", entrepriseId).maybeSingle();
  return versParametres(entrepriseId, data as LigneParametresRelances | null);
}

// Pour le cron : ne charge QUE les entreprises ayant explicitement activé l'auto (au moins
// un des deux volets), pour ne jamais itérer sur l'ensemble de la base à chaque exécution.
export async function chargerEntreprisesAvecRelancesAutoActives(supabase: SupabaseClient): Promise<ParametresRelances[]> {
  const { data } = await supabase
    .from("parametres_relances")
    .select("*")
    .or("devis_auto_actif.eq.true,factures_auto_actif.eq.true");
  return (data ?? []).map((ligne) => versParametres((ligne as LigneParametresRelances).entreprise_id, ligne as LigneParametresRelances));
}
