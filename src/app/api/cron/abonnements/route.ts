import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajouterOptionIAAbonnement, estPalierOptionIA, estPeriodiciteAbonnement, reconcilierAbonnementStripe } from "@/lib/stripe-abonnement";
import { cronsSontActifs, relancesAutoEstActive } from "@/lib/preview-features";
import { traiterRelancesAutomatiques } from "@/lib/relances-cron";

// Bascule les essais Option IA expires vers la facturation reelle. Regroupe avec le cron
// des abonnements (et non un cron dedie) car le plan Vercel Hobby limite le nombre de
// crons disponibles.
async function convertirEssaisOptionIAExpires(admin: ReturnType<typeof createAdminClient>) {
  const { data: essaisExpires, error } = await admin
    .from("entreprises")
    .select("id,stripe_subscription_id,abonnement_periodicite,option_ia_palier")
    .eq("option_ia_statut", "essai")
    .lt("option_ia_essai_fin", new Date().toISOString());
  if (error) return [{ entrepriseId: "-", ok: false, raison: error.message }];

  const resultats: Array<{ entrepriseId: string; ok: boolean; raison?: string }> = [];
  for (const entreprise of essaisExpires ?? []) {
    const periodiciteBrute = String(entreprise.abonnement_periodicite ?? "mensuel");
    const periodicite = estPeriodiciteAbonnement(periodiciteBrute) ? periodiciteBrute : "mensuel";
    const palierBrute = String(entreprise.option_ia_palier ?? "300");
    const palier = estPalierOptionIA(palierBrute) ? palierBrute : "300";
    if (!entreprise.stripe_subscription_id) {
      // Essai termine sans abonnement de base souscrit : l'IA se coupe, sans facturation.
      await admin.from("entreprises").update({ option_ia_statut: "indisponible" }).eq("id", entreprise.id);
      resultats.push({ entrepriseId: entreprise.id, ok: true, raison: "essai_expire_sans_abonnement" });
      continue;
    }
    try {
      const item = await ajouterOptionIAAbonnement(entreprise.stripe_subscription_id, palier, periodicite);
      await admin.from("entreprises").update({ option_ia_statut: "actif", option_ia_stripe_item_id: item.id }).eq("id", entreprise.id);
      resultats.push({ entrepriseId: entreprise.id, ok: true });
    } catch (erreur) {
      resultats.push({ entrepriseId: entreprise.id, ok: false, raison: erreur instanceof Error ? erreur.message : "Erreur" });
    }
  }
  return resultats;
}

// Rattrapage quotidien du module paie : re-synchronise (pointages/congés/notes de frais/
// grands déplacements) toute période encore ouverte, sans attendre un clic manuel. Greffé
// ici plutôt que sur un cron dédié, pour la même raison que convertirEssaisOptionIAExpires
// ci-dessus (plan Vercel Hobby, nombre de crons limité).
async function synchroniserPeriodesPaieOuvertes(admin: ReturnType<typeof createAdminClient>) {
  const { data: periodes, error } = await admin
    .from("periodes_paie")
    .select("id, entreprise_id")
    .in("statut", ["brouillon", "saisie_en_cours", "a_controler"]);
  if (error) return [{ periodeId: "-", ok: false, raison: error.message }];

  const resultats: Array<{ periodeId: string; ok: boolean; raison?: string }> = [];
  for (const periode of periodes ?? []) {
    const { error: syncError } = await admin.rpc("synchroniser_periode_paie_service", { p_periode_id: periode.id });
    resultats.push({ periodeId: periode.id, ok: !syncError, raison: syncError?.message });
  }
  return resultats;
}

// Alertes pointage : salarié qui n'a pas pointé un jour attendu, et rappel quotidien
// aux valideurs tant que des heures restent non validées. Greffé ici pour la même
// raison que les fonctions ci-dessus (limite de crons du plan Vercel Hobby).
async function notifierPointagesManquantsEtAValider(admin: ReturnType<typeof createAdminClient>) {
  const { error } = await admin.rpc("notifier_pointages_manquants_et_a_valider");
  return { ok: !error, raison: error?.message };
}

// RELANCES-AUTO-PROD-ACTIVATION-V1 §9 : les jobs historiques (Stripe, option IA, paie,
// pointage) restent gardés par FEATURE_CRONS_ENABLED. Les relances ont leur PROPRE porte,
// FEATURE_RELANCES_AUTO_ENABLED, totalement indépendante — l'objectif explicite de ce lot
// est de pouvoir activer les relances sans jamais réveiller les jobs historiques (Stripe
// Live notamment), sans créer de deuxième cron Vercel ni de deuxième secret. Même endpoint,
// même authentification CRON_SECRET, même cadence Vercel : seul le contenu exécuté à
// l'intérieur se ramifie en deux branches indépendantes.
async function executerJobsHistoriques(admin: ReturnType<typeof createAdminClient>) {
  const { data: entreprises, error } = await admin.from("entreprises").select("id").not("stripe_subscription_id", "is", null).in("abonnement_statut", ["essai", "actif"]);
  if (error) {
    console.error("Échec du traitement périodique des abonnements", error);
    return { erreur: "Traitement impossible" as const };
  }
  const resultats: Array<{ entrepriseId: string; synchronise: boolean; raison?: string }> = [];
  for (const entreprise of entreprises ?? []) {
    try {
      const resultat = await reconcilierAbonnementStripe(entreprise.id);
      resultats.push({ entrepriseId: entreprise.id, ...resultat });
    } catch (erreur) {
      resultats.push({ entrepriseId: entreprise.id, synchronise: false, raison: erreur instanceof Error ? erreur.message : "Erreur" });
    }
  }
  const optionIA = await convertirEssaisOptionIAExpires(admin);
  const paiePeriodes = await synchroniserPeriodesPaieOuvertes(admin);
  const alertesPointage = await notifierPointagesManquantsEtAValider(admin);
  return { traitees: resultats.length, resultats, optionIA, paiePeriodes, alertesPointage };
}

export async function GET(request: Request) {
  const cronsActifs = cronsSontActifs();
  const relancesActives = relancesAutoEstActive();
  // §11 : si aucune des deux portes n'est ouverte, comportement identique à l'existant
  // avant ce lot (404) — cohérent avec /api/cron/notifications-push, plutôt qu'un nouveau
  // code 200 "no-op" qui masquerait silencieusement un oubli de configuration.
  if (!cronsActifs && !relancesActives) {
    return NextResponse.json({ error: "Tâches planifiées désactivées" }, { status: 404 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });

  const admin = createAdminClient();

  // Branches réellement indépendantes : une erreur dans l'une ne doit jamais empêcher
  // l'autre de s'exécuter (§13 — les relances doivent tourner même si crons historiques
  // désactivés ; et symétriquement, une panne des jobs historiques ne doit jamais avaler
  // silencieusement les relances).
  const jobsHistoriques = cronsActifs
    ? await executerJobsHistoriques(admin)
    : { executes: false as const };
  // traiterRelancesAutomatiques revérifie elle-même relancesAutoEstActive() en interne
  // (defense en profondeur, cf. src/lib/relances-cron.ts) : l'appeler inconditionnellement
  // ici est sûr, elle no-op proprement si le flag est faux.
  const relances = await traiterRelancesAutomatiques(admin);

  if (jobsHistoriques && "erreur" in jobsHistoriques) {
    // Les jobs historiques ont échoué au chargement (erreur DB) : comportement identique à
    // avant ce lot pour ce cas précis (500), mais SEULEMENT s'ils étaient sensés tourner —
    // les relances ont déjà été exécutées ci-dessus dans tous les cas.
    return NextResponse.json({ error: jobsHistoriques.erreur, relances }, { status: 500 });
  }

  return NextResponse.json({ cronsActifs, relancesActives, jobsHistoriques, relances });
}
