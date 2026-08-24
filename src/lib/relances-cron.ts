import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { relancesAutoEstActive } from "@/lib/preview-features";
import { chargerEntreprisesAvecRelancesAutoActives } from "@/lib/relances-config";
import { listerCandidatsAutoDevis, listerCandidatsAutoFactures, executerRelance } from "@/lib/relances-moteur";

export type ResultatCronRelances = {
  actif: boolean;
  entreprisesTraitees: number;
  envoyees: number;
  ignorees: number;
  echecs: number;
  dejaEnCours: number;
  details: Array<{ entrepriseId: string; typeDocument: string; documentId: string; statut: string; motif?: string }>;
};

// Job du cron quotidien de relances — greffé sur /api/cron/abonnements plutôt qu'un cron
// dédié, pour la même raison déjà documentée dans ce fichier (plan Vercel Hobby, nombre de
// crons limité). Gardé fail-closed par son propre sous-flag FEATURE_RELANCES_AUTO_ENABLED
// (§78) : peut être coupé indépendamment de FEATURE_CRONS_ENABLED (qui couvre aussi
// abonnements/paie/notifications) et indépendamment de la relance manuelle (qui reste
// disponible même si ce sous-flag est désactivé — seule l'automatisation est concernée).
export async function traiterRelancesAutomatiques(admin: SupabaseClient): Promise<ResultatCronRelances> {
  if (!relancesAutoEstActive()) {
    return { actif: false, entreprisesTraitees: 0, envoyees: 0, ignorees: 0, echecs: 0, dejaEnCours: 0, details: [] };
  }

  const configs = await chargerEntreprisesAvecRelancesAutoActives(admin);
  const aujourdhui = new Date();
  const details: ResultatCronRelances["details"] = [];
  let envoyees = 0, ignorees = 0, echecs = 0, dejaEnCours = 0;

  for (const config of configs) {
    const { data: entreprise } = await admin.from("entreprises").select("nom").eq("id", config.entrepriseId).maybeSingle();
    const entrepriseNom = entreprise?.nom ?? "";

    const candidats: Awaited<ReturnType<typeof listerCandidatsAutoDevis>>["candidats"] = [];
    if (config.devisAutoActif) {
      const { candidats: c } = await listerCandidatsAutoDevis(admin, config.entrepriseId, config, aujourdhui);
      candidats.push(...c);
    }
    if (config.facturesAutoActif) {
      const { candidats: c } = await listerCandidatsAutoFactures(admin, config.entrepriseId, config, aujourdhui);
      candidats.push(...c);
    }

    for (const candidat of candidats) {
      const resultat = await executerRelance(admin, config.entrepriseId, config, candidat, {
        automatique: true,
        declenchePar: null,
        entrepriseNom,
        prenomEmetteur: null,
        aujourdhui,
      });
      if (resultat.statut === "envoyee") envoyees++;
      else if (resultat.statut === "ignoree") ignorees++;
      else if (resultat.statut === "echec") echecs++;
      else dejaEnCours++;
      details.push({
        entrepriseId: config.entrepriseId,
        typeDocument: candidat.typeDocument,
        documentId: candidat.documentId,
        statut: resultat.statut,
        motif: "motif" in resultat ? resultat.motif : undefined,
      });
    }
  }

  return { actif: true, entreprisesTraitees: configs.length, envoyees, ignorees, echecs, dejaEnCours, details };
}
