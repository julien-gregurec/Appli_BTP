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
  erreur?: string;
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

  // ACL canonique (migration 255) : le client service_role ne lit plus les documents commerciaux en
  // direct ; le moteur passe en « chemin de service » (RPC dédiées). Une panne de lecture est rendue
  // visible dans le résultat du cron au lieu de ressembler à « rien à relancer ».
  let configs: Awaited<ReturnType<typeof chargerEntreprisesAvecRelancesAutoActives>>;
  try {
    configs = await chargerEntreprisesAvecRelancesAutoActives(admin);
  } catch (erreur) {
    return {
      actif: true, entreprisesTraitees: 0, envoyees: 0, ignorees: 0, echecs: 0, dejaEnCours: 0, details: [],
      erreur: erreur instanceof Error ? erreur.message : "Chargement des relances impossible",
    };
  }
  const aujourdhui = new Date();
  const details: ResultatCronRelances["details"] = [];
  let envoyees = 0, ignorees = 0, echecs = 0, dejaEnCours = 0;

  for (const config of configs) {
    try {
      const { data: entreprise } = await admin.from("entreprises").select("nom").eq("id", config.entrepriseId).maybeSingle();
      const entrepriseNom = entreprise?.nom ?? "";

      const candidats: Awaited<ReturnType<typeof listerCandidatsAutoDevis>>["candidats"] = [];
      if (config.devisAutoActif) {
        const { candidats: c } = await listerCandidatsAutoDevis(admin, config.entrepriseId, config, aujourdhui, { service: true });
        candidats.push(...c);
      }
      if (config.facturesAutoActif) {
        const { candidats: c } = await listerCandidatsAutoFactures(admin, config.entrepriseId, config, aujourdhui, { service: true });
        candidats.push(...c);
      }

      for (const candidat of candidats) {
        const resultat = await executerRelance(admin, config.entrepriseId, config, candidat, {
          automatique: true,
          declenchePar: null,
          entrepriseNom,
          prenomEmetteur: null,
          aujourdhui,
          service: true,
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
    } catch (erreur) {
      echecs++;
      details.push({
        entrepriseId: config.entrepriseId,
        typeDocument: "-",
        documentId: "-",
        statut: "echec",
        motif: erreur instanceof Error ? erreur.message : "Traitement des relances impossible",
      });
    }
  }

  return { actif: true, entreprisesTraitees: configs.length, envoyees, ignorees, echecs, dejaEnCours, details };
}
